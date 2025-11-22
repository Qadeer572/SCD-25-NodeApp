# Use official Node.js image as base
FROM node:20-alpine

# Set working directory
WORKDIR /app

RUN apk add --no-cache perl
# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the code
COPY . .

# Expose the port your app runs on
EXPOSE 3000

#conternization branch
# Command to run the app
CMD ["npm", "start"]
