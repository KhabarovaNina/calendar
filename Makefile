# Calendar — аналог Cal.com
# TypeSpec-спека (корень) + фронтенд с мок-бэкендом (web/)

WEB := web

.DEFAULT_GOAL := help

.PHONY: help install install-root install-web dev build preview typecheck \
        spec docs clean

help: ## Показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: install-root install-web ## Установить все зависимости (корень + web)

install-root: ## Установить зависимости TypeSpec (корень)
	npm install

install-web: ## Установить зависимости фронтенда (web/)
	cd $(WEB) && npm install

dev: ## Запустить фронтенд в dev-режиме (http://localhost:5173)
	cd $(WEB) && npm run dev

build: ## Собрать фронтенд в web/dist
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
