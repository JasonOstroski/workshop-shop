.PHONY: up load down reset clean

up:
		docker compose up -d --wait
		@curl --fail --silent http://localhost:8088/health >/dev/null
		@echo "Shop is ready at http://localhost:8088"

load:
	docker compose --profile loadgen up load-generator

down:
		docker compose down --remove-orphans

reset:
	docker compose down -v

clean: reset up
