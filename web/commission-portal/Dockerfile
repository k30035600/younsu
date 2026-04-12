# Railway / 컨테이너 배포 (서비스 Root Directory: web/commission-portal)
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json start.js ./
COPY public ./public
ENV PORT=8282
ENV COMMISSION_LISTEN_HOST=0.0.0.0
EXPOSE 8282
CMD ["node", "start.js"]
