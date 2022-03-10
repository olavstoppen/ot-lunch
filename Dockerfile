FROM node:16-alpine
# RUN apt-get install -y git
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

ENV PORT=5001
EXPOSE 5001

CMD [ "npm", "start" ]
