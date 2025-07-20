# Primitive makefile for including just required files in the distribution.
FILES=index.html options.html profiles.html manifest.json
DIRS=images styles js fonts
DIST=dist
JS=engine.js index.js options.js profiles.js migration.js
CSS=index.css options.css normalize.css
JSMIN=uglifyjs --compress --mangle
CSSMIN=sass --stdin --style=compressed

dist: clean copy minify pack

copy:
	@echo "### Copying files"
	powershell -Command "Copy-Item -Recurse -Force -Path images,styles,js,fonts,index.html,options.html,profiles.html,manifest.json -Destination dist"

minify: $(JS) $(CSS)
	@echo "### Minification complete"

%.js:
	type $(DIST)\js\$@ | $(JSMIN) > $(DIST)\js\$@.minify
	move /Y $(DIST)\js\$@.minify $(DIST)\js\$@

%.css:
	type $(DIST)\styles\$@ | $(CSSMIN) > $(DIST)\styles\$@.minify
	move /Y $(DIST)\styles\$@.minify $(DIST)\styles\$@

pack:
	@echo "### Packing..."
	powershell -Command "Get-ChildItem -Path $(DIST) -Recurse -Filter '.DS_Store' | Remove-Item -Force"
	cd $(DIST) && powershell -Command "Compress-Archive -Path * -DestinationPath dist.zip -Force"

clean:
	powershell -Command "if (Test-Path '$(DIST)') { Remove-Item -Recurse -Force '$(DIST)' }"
	mkdir $(DIST)

# New build script for clean export
build:
	@echo "### Cleaning dist directory of unwanted files..."
# Remove unwanted files (examples: .DS_Store, *.log, etc.)
	powershell -Command "Get-ChildItem -Path dist -Recurse -Include .DS_Store,*.log | Remove-Item -Force"
	@echo "### Creating new zip file..."
	cd dist && powershell -Command "Compress-Archive -Path * -DestinationPath ../extension-export.zip -Force"
	@echo "### Build complete: extension-export.zip created."
