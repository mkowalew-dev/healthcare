VERSION ?= $(shell node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
ARTIFACT := careconnect-portal-$(VERSION).tar.gz
RELEASE_DIR := .release/careconnect-portal-$(VERSION)

.PHONY: install dev build preview release clean distclean

install:
	npm install

dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

release: build
	@echo "→ Packaging v$(VERSION)..."
	@rm -rf .release
	@mkdir -p $(RELEASE_DIR)/dist
	@cp -r dist/. $(RELEASE_DIR)/dist/
	@cp nginx.conf $(RELEASE_DIR)/
	@cp scripts/install.sh $(RELEASE_DIR)/
	@chmod +x $(RELEASE_DIR)/install.sh
	@cd .release && tar -czf ../$(ARTIFACT) careconnect-portal-$(VERSION)
	@rm -rf .release
	@echo ""
	@echo "✓ Release artifact: $(ARTIFACT)"
	@echo ""
	@echo "  Install on Ubuntu:"
	@echo "    tar -xzf $(ARTIFACT)"
	@echo "    cd careconnect-portal-$(VERSION)"
	@echo "    sudo ./install.sh"
	@echo ""

clean:
	rm -rf dist .release

distclean: clean
	rm -rf node_modules *.tar.gz
