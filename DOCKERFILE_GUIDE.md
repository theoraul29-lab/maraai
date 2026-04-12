# Dockerfile Guide

## Overview
This guide provides comprehensive documentation on using Docker files in the `maraai` repository for different environments and purposes.

## 1. Node.js Dockerfile for Production
This Dockerfile is used for building the production-ready image of the Node.js application.
### Example Dockerfile
```dockerfile
FROM node:14

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json for dependency installation
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD [ "node", "server.js" ]
```
### Build and Run
To build and run the production image, use:
```bash
# Build image
docker build -t maraai-node-production .

# Run container
docker run -p 3000:3000 maraai-node-production
```

## 2. Frontend Dockerfile for Static Hosting
This Dockerfile is designed for serving static files through a lightweight web server.
### Example Dockerfile
```dockerfile
FROM nginx:alpine

# Copy files to nginx html directory
COPY ./frontend/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx server
CMD ["nginx", "-g", "daemon off;"]
```
### Build and Run
To build and run the frontend image, use:
```bash
# Build image
docker build -t maraai-frontend .

# Run container
docker run -p 80:80 maraai-frontend
```

## 3. Docker Compose for Local Development
Use Docker Compose to simplify the setup for local development with multiple services.
### Example docker-compose.yml
```yaml
version: '3'
services:
  node-app:
    build:
      context: .
      dockerfile: Dockerfile.production
    ports:
      - "3000:3000"
    volumes:
      - .:/usr/src/app

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
```
### Start the Application
To start the application with Docker Compose, run:
```bash
docker-compose up
```

## 4. Cloud Build Configuration
Integrate Cloud Build to automate the building and deploying of Docker images.
### Example cloudbuild.yaml
```yaml
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', 'gcr.io/$PROJECT_ID/maraai-node-production', '.']

- name: 'gcr.io/cloud-builders/docker'
  args: ['push', 'gcr.io/$PROJECT_ID/maraai-node-production']

images:
- 'gcr.io/$PROJECT_ID/maraai-node-production'
```
### Build in Cloud Build
To trigger a build in Cloud Build, use:
```bash
gcloud builds submit --config cloudbuild.yaml
```

## Conclusion
This guide provides the necessary instructions and examples to effectively utilize Docker for the `maraai` project across various environments and configurations.