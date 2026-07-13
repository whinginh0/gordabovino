FROM nginx:alpine

# Copy sales page
COPY index.html /usr/share/nginx/html/index.html

# Copy members area directory
COPY areademembros /usr/share/nginx/html/areademembros

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
