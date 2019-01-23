FROM node:7-slim
RUN apt-get update && apt-get install -y graphicsmagick
ARG path=.
WORKDIR /usr/src/app
COPY $path/package.json /usr/src/app/
RUN npm install
COPY $path /usr/src/app/

CMD node index.js
