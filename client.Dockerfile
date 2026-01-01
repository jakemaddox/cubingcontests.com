FROM node:24.12-alpine3.22

# Expose port
EXPOSE $NEXTJS_PORT

COPY client /app/client

WORKDIR /app/client

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_BASE_URL

RUN pnpm install --production?
RUN pnpm run build

CMD [ "pnpm", "run", "start" ]
