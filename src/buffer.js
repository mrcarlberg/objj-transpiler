export class StringBuffer {

    constructor(useSourceNode, file, sourceContent) {
        if (useSourceNode) {
            this.rootNode = new sourceMap.SourceNode();
            this.concat = this.concatSourceNode;
            this.toString = this.toStringSourceNode;
            this.isEmpty = this.isEmptySourceNode;
            this.appendStringBuffer = this.appendStringBufferSourceNode;
            this.length = this.lengthSourceNode;
            this.removeAtIndex = this.removeAtIndexSourceNode;
            if (file) {
                var fileString = file.toString(),
                    filename = fileString.substr(fileString.lastIndexOf('/') + 1),
                    sourceRoot = fileString.substr(0, fileString.lastIndexOf('/') + 1);

                this.filename = filename;

                if (sourceRoot.length > 0)
                    this.sourceRoot = sourceRoot;
                if (sourceContent != null)
                    this.rootNode.setSourceContent(filename, sourceContent);
            }

            if (sourceContent != null)
                this.sourceContent = sourceContent;
        } else {
            this.atoms = [];
            this.concat = this.concatString;
            this.toString = this.toStringString;
            this.isEmpty = this.isEmptyString;
            this.appendStringBuffer = this.appendStringBufferString;
            this.length = this.lengthString;
            this.removeAtIndex = this.removeAtIndexString;
        }
    }

    toStringString() {
        return this.atoms.join("");
    }

    toStringSourceNode() {
        return this.rootNode.toStringWithSourceMap({ file: this.filename + "s", sourceRoot: this.sourceRoot });
    }

    concatString(aString) {
        this.atoms.push(aString);
    }

    concatSourceNode(aString, node, originalName) {
        if (node) {
            //console.log("Snippet: " + aString + ", line: " + node.loc.start.line + ", column: " + node.loc.start.column + ", source: " + node.loc.source);
            this.rootNode.add(new sourceMap.SourceNode(node.loc.start.line, node.loc.start.column, node.loc.source, aString, originalName));
        } else
            this.rootNode.add(aString);
        if (!this.notEmpty)
            this.notEmpty = true;
    }

    // '\n' will indent. '\n\0' will not indent. '\n\1' will indent one more then the current indent level.
    // '\n\-1' will indent one less then the current indent level. Numbers from 0-9 can me used.
    concatFormat(aString) {
        if (!aString) return;
        var lines = aString.split("\n"),
            size = lines.length;
        if (size > 1) {
            this.concat(lines[0]);
            for (var i = 1; i < size; i++) {
                var line = lines[i];
                this.concat("\n");
                if (line.slice(0, 1) === "\\") {
                    var numberLength = 1;
                    var indent = line.slice(1, 1 + numberLength);
                    if (indent === '-') {
                        numberLength = 2;
                        indent = line.slice(1, 1 + numberLength);
                    }
                    var indentationNumber = parseInt(indent);
                    if (indentationNumber) {
                        this.concat(indentationNumber > 0 ? indentation + Array(indentationNumber * indentationSpaces + 1).join(indentType) : indentation.substring(indentationSize * -indentationNumber));
                    }
                    line = line.slice(1 + numberLength);
                } else if (line || i === size - 1) {
                    // Ident if there is something between line breaks or the last linebreak
                    this.concat(indentation);
                }
                if (line) this.concat(line);
            }
        } else
            this.concat(aString);
    }

    isEmptyString() {
        return this.atoms.length !== 0;
    }

    isEmptySourceNode() {
        return this.notEmpty;
    }

    appendStringBufferString(stringBuffer) {
        // We can't do 'this.atoms.push.apply(this.atoms, stringBuffer.atoms);' as JavaScriptCore (WebKit) has a limit on number of arguments at 65536.
        // Other browsers also have simular limits.
        var thisAtoms = this.atoms;
        var thisLength = thisAtoms.length;
        var stringBufferAtoms = stringBuffer.atoms;
        var stringBufferLength = stringBufferAtoms.length;

        thisAtoms.length = thisLength + stringBufferLength;

        for (var i = 0; i < stringBufferLength; i++) {
            thisAtoms[thisLength + i] = stringBufferAtoms[i];
        }
    }

    appendStringBufferSourceNode(stringBuffer) {
        this.rootNode.add(stringBuffer.rootNode);
    }

    lengthString() {
        return this.atoms.length;
    }

    lengthSourceNode() {
        return this.rootNode.children.length;
    }

    removeAtIndexString(index) {
        return this.atoms[index] = "";
    }

    removeAtIndexSourceNode(index) {
        return this.rootNode.children[index] = "";
    }

}