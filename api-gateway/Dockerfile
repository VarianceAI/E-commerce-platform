FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY dashboard /usr/share/nginx/html/dashboard

EXPOSE 8000

CMD ["nginx", "-g", "daemon off;"]
