FROM node:22-slim
WORKDIR /app
RUN npm i -g pnpm@10.29.1
COPY . .
RUN pnpm install --no-frozen-lockfile
CMD ["pnpm", "--filter", "@bsa/facilitator", "start"]
