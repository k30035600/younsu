# Railway / 컨테이너 배포 (서비스 Root Directory: web/commission-portal)
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json start.js ./
COPY public ./public
EXPOSE 3000
CMD ["node", "start.js"]
