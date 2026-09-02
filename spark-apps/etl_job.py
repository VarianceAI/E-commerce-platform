"""
Spark Offline ETL Job — CDC (MySQL via Debezium) → MinIO (S3-compatible) as Parquet
Reads change events from Debezium Kafka topics and partitions them by date into S3/MinIO.

Run:
  spark-submit --packages \
    org.apache.spark:spark-sql-kafka-0-10_2.12:3.3.0,\
    org.apache.hadoop:hadoop-aws:3.3.4 \
    etl_job.py
"""

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, from_json, get_json_object, to_date, coalesce, lit, current_timestamp
)
from pyspark.sql.types import (
    StructType, StructField, StringType, LongType, DoubleType
)
import os

KAFKA_BROKERS   = os.getenv("KAFKA_BROKERS",   "kafka:29092")
MINIO_ENDPOINT  = os.getenv("MINIO_ENDPOINT",  "http://minio:9000")
MINIO_ACCESS    = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET    = os.getenv("MINIO_SECRET_KEY", "minioadmin")
S3_BUCKET       = os.getenv("S3_BUCKET",        "ecommerce-data")

# ---------------------------------------------------------------------------
# Spark Session with S3A (MinIO) configuration
# ---------------------------------------------------------------------------
spark = SparkSession.builder \
    .appName("EcommerceETL_CDC_to_S3") \
    .config("spark.jars.packages",
            "org.apache.spark:spark-sql-kafka-0-10_2.12:3.3.0,"
            "org.apache.hadoop:hadoop-aws:3.3.4") \
    .config("spark.hadoop.fs.s3a.access.key",              MINIO_ACCESS) \
    .config("spark.hadoop.fs.s3a.secret.key",              MINIO_SECRET) \
    .config("spark.hadoop.fs.s3a.endpoint",                MINIO_ENDPOINT) \
    .config("spark.hadoop.fs.s3a.path.style.access",       "true") \
    .config("spark.hadoop.fs.s3a.connection.ssl.enabled",  "false") \
    .config("spark.hadoop.fs.s3a.impl",
            "org.apache.hadoop.fs.s3a.S3AFileSystem") \
    .getOrCreate()

spark.sparkContext.setLogLevel("WARN")

# ---------------------------------------------------------------------------
# Debezium envelope schema (after-image only)
# ---------------------------------------------------------------------------
debezium_schema = StructType([
    StructField("op",    StringType(), True),   # c=create, u=update, d=delete
    StructField("ts_ms", LongType(),   True),
    StructField("after", StringType(), True),   # JSON string of the row
])

order_after_schema = StructType([
    StructField("id",           LongType(),   True),
    StructField("user_id",      LongType(),   True),
    StructField("total_amount", DoubleType(), True),
    StructField("status",       StringType(), True),
    StructField("created_at",   LongType(),   True),   # epoch ms from Debezium
    StructField("updated_at",   LongType(),   True),
])

# ---------------------------------------------------------------------------
# Read CDC stream from Debezium Kafka topic
# ---------------------------------------------------------------------------
raw_df = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", KAFKA_BROKERS) \
    .option("subscribe", "mysql-server.ecommerce_db.orders") \
    .option("startingOffsets", "earliest") \
    .option("failOnDataLoss", "false") \
    .load()

# Parse envelope
envelope_df = raw_df.select(
    from_json(col("value").cast("string"), debezium_schema).alias("env")
).select("env.*")

# Keep only inserts and updates (op = 'c' or 'u'), skip deletes
upserts_df = envelope_df.filter(col("op").isin("c", "u"))

# Parse the after-image
orders_df = upserts_df.select(
    from_json(col("after"), order_after_schema).alias("row"),
    col("ts_ms")
).select(
    col("row.id").alias("order_id"),
    col("row.user_id"),
    col("row.total_amount"),
    col("row.status"),
    (col("row.created_at") / 1000).cast("timestamp").alias("created_at"),
    (col("row.updated_at") / 1000).cast("timestamp").alias("updated_at"),
    current_timestamp().alias("etl_processed_at")
)

# Partition column for Parquet storage
orders_partitioned = orders_df.withColumn(
    "partition_date", to_date(coalesce(col("created_at"), lit(None).cast("timestamp")))
)

# ---------------------------------------------------------------------------
# Write to MinIO as Parquet, partitioned by date
# ---------------------------------------------------------------------------
orders_query = orders_partitioned \
    .writeStream \
    .format("parquet") \
    .option("path",               f"s3a://{S3_BUCKET}/orders/") \
    .option("checkpointLocation", f"s3a://spark-checkpoints/orders/") \
    .outputMode("append") \
    .partitionBy("partition_date") \
    .trigger(processingTime="5 minutes") \
    .start()

# ---------------------------------------------------------------------------
# Also ETL order_items CDC (topic: mysql-server.ecommerce_db.order_items)
# ---------------------------------------------------------------------------
raw_items_df = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", KAFKA_BROKERS) \
    .option("subscribe", "mysql-server.ecommerce_db.order_items") \
    .option("startingOffsets", "earliest") \
    .option("failOnDataLoss", "false") \
    .load()

item_after_schema = StructType([
    StructField("id",         LongType(),   True),
    StructField("order_id",   LongType(),   True),
    StructField("product_id", LongType(),   True),
    StructField("quantity",   LongType(),   True),
    StructField("unit_price", DoubleType(), True),
    StructField("created_at", LongType(),   True),
])

items_df = raw_items_df.select(
    from_json(col("value").cast("string"), debezium_schema).alias("env")
).select("env.*") \
 .filter(col("op").isin("c", "u")) \
 .select(from_json(col("after"), item_after_schema).alias("row")) \
 .select(
    col("row.id").alias("item_id"),
    col("row.order_id"),
    col("row.product_id"),
    col("row.quantity"),
    col("row.unit_price"),
    (col("row.created_at") / 1000).cast("timestamp").alias("created_at"),
    current_timestamp().alias("etl_processed_at")
 ) \
 .withColumn("partition_date", to_date(col("created_at")))

items_query = items_df \
    .writeStream \
    .format("parquet") \
    .option("path",               f"s3a://{S3_BUCKET}/order_items/") \
    .option("checkpointLocation", f"s3a://spark-checkpoints/order_items/") \
    .outputMode("append") \
    .partitionBy("partition_date") \
    .trigger(processingTime="5 minutes") \
    .start()

spark.streams.awaitAnyTermination()
