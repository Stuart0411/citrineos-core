# SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
#
# SPDX-License-Identifier: Apache-2.0

FROM --platform=${BUILDPLATFORM:-linux/amd64} node:24.16.0 AS build

RUN corepack enable

WORKDIR /usr/local/apps/citrineos

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@citrineos/ems-addon..." build
RUN pnpm --filter "@citrineos/ems-addon" deploy --legacy --prod /deploy

FROM node:24.16.0-slim

COPY --from=build /deploy /usr/local/apps/citrineos/packages/ems-addon

WORKDIR /usr/local/apps/citrineos/packages/ems-addon

ENTRYPOINT ["node", "dist/src/runtime/main.js"]
