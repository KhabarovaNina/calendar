# Calendar — аналог Cal.com
# TypeSpec-спека (корень) + фронтенд (web/) + реальный бэкенд на SQLite (server/)

WEB := web
SERVER := server

.DEFAULT_GOAL := help

.PHONY: help install install-root install-web install-server dev dev-mock \
        back back-seed back-reset mock gen build preview \
        typecheck spec docs clean

help: ## Показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: install-root install-web install-server ## Установить все зависимости (корень + web + server)

install-root: ## Установить зависимости TypeSpec (корень)
	npm install

install-web: ## Установить зависимости фронтенда (web/)
	cd $(WEB) && npm install

install-server: ## Установить зависимости бэкенда (server/)
	cd $(SERVER) && npm install

dev: ## Запустить реальный бэкенд SQLite (:4010) + фронтенд (:5173)
	npm run dev

dev-mock: spec gen ## Старый режим: Prism mock (:4010) + фронтенд (:5173)
	npm run dev:mock

back: ## Запустить только бэкенд на SQLite (http://localhost:4010)
	npm run back

back-seed: ## Наполнить БД демо-данными (если пуста)
	npm run back:seed

back-reset: ## Пересоздать БД с нуля и засеять демо-данными
	rm -f $(SERVER)/data.db $(SERVER)/data.db-shm $(SERVER)/data.db-wal && npm run back:seed

mock: spec ## Запустить только Prism mock-сервер (http://localhost:4010)
	npm run mock

gen: ## Сгенерировать TS-типы фронтенда из OpenAPI
	cd $(WEB) && npm run gen:api

build: gen ## Собрать фронтенд в web/dist
	cd $(WEB) && npm run build

preview: ## Просмотр production-сборки фронтенда
	cd $(WEB) && npm run preview

typecheck: ## Проверить типы фронтенда
	cd $(WEB) && npm run typecheck

spec: ## Скомпилировать TypeSpec в OpenAPI (tsp-output/schema)
	npm run docs:build

docs: ## Собрать спеку и открыть Swagger UI (http://localhost:8080/docs/)
	npm run docs

clean: ## Удалить сборки и сгенерированные артефакты
	rm -rf tsp-output $(WEB)/dist $(WEB)/node_modules/.vite
