.PHONY: install dev start stop db-push db-seed db-studio generate

install:
	pnpm install
	./node_modules/.bin/prisma generate
	./node_modules/.bin/prisma db push
	./node_modules/.bin/prisma db seed || true

dev:
	pnpm dev

start:
	docker compose up -d

stop:
	docker compose down

db-push:
	./node_modules/.bin/prisma db push

db-seed:
	./node_modules/.bin/prisma db seed

db-studio:
	./node_modules/.bin/prisma studio

generate:
	./node_modules/.bin/prisma generate

cleanup-cvs:
	curl -X POST http://localhost:3000/api/cron/cleanup-cvs

logs:
	docker compose logs -f
