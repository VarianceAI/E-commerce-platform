"""
Spark Structured Streaming Analytics Job
Reads order-events from Kafka, computes GMV / orders-per-minute / inventory alerts,
and writes results to both Elasticsearch (for dashboards) and Redis (for low-latency APIs).

Run:
  spark-submit --packages \
    org.apache.spark:spark-sql-kafka-0-10_2.12:3.3.0,\
    org.elasticsearch:elasticsearch-spark-30_2.12:8.5.0 \
    analytics_job.py
"""

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, from_json, window, count, sum as spark_sum,
    to_timestamp, current_timestamp
)
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, IntegerType, ArrayType
)
import redis
import json
import os

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "kafka:29092")
ES_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")

# ---------------------------------------------------------------------------
# Spark Session
# ---------------------------------------------------------------------------
spark = SparkSession.builder \
    .appName("EcommerceRealtimeAnalytics") \
    .config("spark.jars.packages",
            "org.apache.spark:spark-sql-kafka-0-10_2.12:3.3.0,"
            "org.elasticsearch:elasticsearch-spark-30_2.12:8.5.0") \
    .config("es.nodes", ES_URL.replace("http://", "").split(":")[0]) \
    .config("es.port", ES_URL.split(":")[-1]) \
    .config("es.nodes.wan.only", "true") \
    .config("es.index.auto.create", "true") \
    .getOrCreate()

spark.sparkContext.setLogLevel("WARN")

# ---------------------------------------------------------------------------
# Schema for order events
# ---------------------------------------------------------------------------
order_schema = StructType([
    StructField("type",        StringType(),  True),
    StructField("orderId",     StringType(),  True),
    StructField("userId",      StringType(),  True),
    StructField("totalAmount", DoubleType(),  True),
    StructField("timestamp",   StringType(),  True),
    StructField("items", ArrayType(StructType([
        StructField("productId", StringType(), True),
        StructField("quantity",  IntegerType(), True),
        StructField("price",     DoubleType(),  True),
    ])), True),
])

# ---------------------------------------------------------------------------
# Read from Kafka
# ---------------------------------------------------------------------------
raw_df = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", KAFKA_BROKERS) \
    .option("subscribe", "order-events") \
    .option("startingOffsets", "latest") \
    .option("failOnDataLoss", "false") \
    .load()

parsed_df = raw_df.select(
    from_json(col("value").cast("string"), order_schema).alias("data"),
    col("timestamp").alias("kafka_timestamp")
).select(
    col("data.*"),
    to_timestamp(col("data.timestamp")).alias("event_time"),
    col("kafka_timestamp")
)

# Keep only OrderCreated events for GMV / OPM metrics
orders_df = parsed_df.filter(col("type") == "OrderCreated")

# ---------------------------------------------------------------------------
# Windowed aggregations (1-minute tumbling window, 10-minute watermark)
# ---------------------------------------------------------------------------
metrics_df = orders_df \
    .withWatermark("event_time", "10 minutes") \
    .groupBy(window("event_time", "1 minute")) \
    .agg(
        count("*").alias("order_count"),
        spark_sum("totalAmount").alias("gmv")
    ) \
    .select(
        col("window.start").alias("window_start"),
        col("window.end").alias("window_end"),
        col("order_count"),
        col("gmv")
    )

# ---------------------------------------------------------------------------
# Write windowed metrics to Elasticsearch
# ---------------------------------------------------------------------------
def write_metrics_to_es(batch_df, batch_id):
    if batch_df.count() == 0:
        return
    batch_df \
        .select(
            col("window_start").cast("string").alias("timestamp"),
            col("order_count"),
            col("gmv")
        ) \
        .write \
        .format("org.elasticsearch.spark.sql") \
        .option("es.resource", "spark-metrics") \
        .option("es.mapping.id", "timestamp") \
        .mode("append") \
        .save()

metrics_query = metrics_df \
    .writeStream \
    .outputMode("update") \
    .foreachBatch(write_metrics_to_es) \
    .option("checkpointLocation", "/tmp/checkpoints/metrics") \
    .trigger(processingTime="30 seconds") \
    .start()

# ---------------------------------------------------------------------------
# Write raw order events to Elasticsearch (event log)
# ---------------------------------------------------------------------------
orders_es_query = orders_df \
    .select(
        col("orderId"),
        col("userId"),
        col("totalAmount"),
        col("event_time").cast("string").alias("timestamp"),
        current_timestamp().cast("string").alias("processed_at")
    ) \
    .writeStream \
    .outputMode("append") \
    .format("org.elasticsearch.spark.sql") \
    .option("es.resource", "order-events-log") \
    .option("checkpointLocation", "/tmp/checkpoints/order-events") \
    .trigger(processingTime="10 seconds") \
    .start()

# ---------------------------------------------------------------------------
# Write real-time GMV / OPM to Redis via foreachBatch
# ---------------------------------------------------------------------------
def update_redis_metrics(batch_df, batch_id):
    rows = batch_df.collect()
    if not rows:
        return
    r = redis.Redis.from_url(REDIS_URL)
    for row in rows:
        gmv_val = float(row["gmv"] or 0)
        count_val = int(row["order_count"] or 0)
        r.incrbyfloat("spark:gmv", gmv_val)
        minute_key = f"spark:orders:{row['window_start']}"
        r.set(minute_key, count_val)
        r.expire(minute_key, 3600)

redis_query = metrics_df \
    .writeStream \
    .outputMode("update") \
    .foreachBatch(update_redis_metrics) \
    .option("checkpointLocation", "/tmp/checkpoints/redis-metrics") \
    .trigger(processingTime="30 seconds") \
    .start()

spark.streams.awaitAnyTermination()
