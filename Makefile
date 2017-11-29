.PHONY: all lint
NODE_BIN=$(shell npm bin)


all: lint


lint:
	$(NODE_BIN)/eslint backbone.js
