.PHONY: up load down reset

up:
	docker compose up -d

load:
	docker compose --profile loadgen up load-generator

down:
	docker compose down

reset:
	docker compose down -v
