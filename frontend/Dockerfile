# --- Etapa 1: Build aplicație frontend ---
FROM node:18-alpine AS build-stage
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Etapa 2: Servire statică cu Nginx ---
FROM nginx:stable-alpine AS production-stage
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build-stage /app/dist /usr/share/nginx/html
ENV PORT 8080
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
