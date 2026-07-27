FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY public ./public

EXPOSE 3000

CMD ["bun", "src/index.ts"]