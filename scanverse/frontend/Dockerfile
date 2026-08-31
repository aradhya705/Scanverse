# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.container.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Use 127.0.0.1 (not "localhost"): busybox wget resolves localhost to
# ::1 first, but nginx listens on IPv4 only, so the check would fail
# forever in IPv6-enabled containers.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -q -O /dev/null http://127.0.0.1:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
