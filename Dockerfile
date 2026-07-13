FROM nginx:alpine

# Copy custom Nginx configuration
COPY default.conf /etc/nginx/conf.d/default.conf

# Copy sales page
COPY index.html /usr/share/nginx/html/index.html

# Copy members area directory
COPY areademembros /usr/share/nginx/html/areademembros

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
