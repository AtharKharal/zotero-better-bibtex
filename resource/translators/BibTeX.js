/*= dict =*/

var Translator = new function() {
  this.id      =  '/*= id =*/';
  this.label   =  '/*= label =*/';
  this.unicode =  /*= unicode =*/;
  this.release =  '/*= release =*/';
  this.typeMap = {};

  var initialized = false;

  function initialize(config) {
    if (initialized) { return; }

    if (!config) { config = {}; }

    this.pattern                = config.pattern                || Zotero.getHiddenPref('better-bibtex.citeKeyFormat');
    this.skipFields             = config.skipFields             || Zotero.getHiddenPref('better-bibtex.skipfields').split(',').map(function(field) { return field.trim(); });
    this.usePrefix              = config.usePrefix              || Zotero.getHiddenPref('better-bibtex.useprefix');
    this.braceAll               = config.braceAll               || Zotero.getHiddenPref('better-bibtex.brace-all');
    this.fancyURLs              = config.fancyURLs              || Zotero.getHiddenPref('better-bibtex.fancyURLs');
    this.langid                 = config.langid                 || Zotero.getHiddenPref('better-bibtex.langid');
    this.conflictResolution     = config.conflictResolution     || Zotero.getHiddenPref('better-bibtex.conflictResolution');
    this.metadataAttachments    = config.metadataAttachments    || Zotero.getHiddenPref('better-bibtex.metadataAttachments');
    this.usePrefix              = config.usePrefix              || Zotero.getHiddenPref('better-bibtex.useprefix');

    this.useJournalAbbreviation = config.useJournalAbbreviation || Zotero.getOption('useJournalAbbreviation');
    this.exportCharset          = config.exportCharset          || Zotero.getOption('exportCharset');
    this.exportFileData         = config.exportFileData         || Zotero.getOption('exportFileData');
    this.exportNotes            = config.exportNotes            || Zotero.getOption('exportNotes');

    if (typeof config.unicode == 'undefined') {
      switch (Zotero.getHiddenPref('better-bibtex.unicode')) {
        case 'always':
          this.unicode = true;
          break;
        case 'never':
          this.unicode = false;
          break;
        default:
          var charset = this.exportCharset;
          this.unicode = this.unicode || (charset && charset.toLowerCase() == 'utf-8');
          break;
      }
    } else {
      this.unicode = config.unicode;
    }

    if (this.typeMap.toBibTeX) {
      this.typeMap.toZotero = Dict({});
      this.typeMap.toBibTeX.forEach(function(zotero, bibtex) {
        if (!(bibtex instanceof Array)) { bibtex = [bibtex]; }

        bibtex = bibtex.map(function(tex) {
          if (!this.typeMap.toZotero.has(tex) || tex.match(/^:/)) {
            this.typeMap.toZotero.set(tex.replace(/^:/, ''), zotero);
          }
          return tex.replace(/^:/, '');
        });

        this.typeMap.toBibTeX.set(zotero, bibtex[0]);
      });
    }

    initialized = true;
  }

  this.item = (function() {
    while (item = Zotero.nextItem()) {
      if (item.itemType == 'note' || item.itemType == 'attachment') { continue; }
      if (!initialized) { initialize(item); }
      Translator.fieldsWritten = Dict({});
      yield item;
    }
  })();
};

function writeFieldMap(item, fieldMap) {
  fieldMap.forEach(function(bibtexField, zoteroField) {
    var brace = !!(zoteroField.literal);
    zoteroField = zoteroField.literal ? zoteroField.literal : zoteroField;

    if(item[zoteroField]) {
      value = item[zoteroField];
      if (['url', 'doi'].indexOf(bibtexField) >= 0) {
        writeField(bibtexField, minimal_escape(value));
      } else {
        writeField(bibtexField, latex_escape(value, {brace: brace}));
      }
    }
  });
}

function writeField(field, value, bare) {
  if (Config.skipFields.indexOf(field) >= 0) { return; }

  if (typeof value == 'number') {
  } else {
    if (!value || value == '') { return; }
  }

  if (!bare) { value = '{' + value + '}'; }

  if (Translator.fieldsWritten.has(field)) { trLog('Field ' + field + ' output more than once!'); }
  Translator.fieldsWritten.set(field, true);
  Zotero.write(",\n  " + field + " = " + value);
}

function escapeAttachments(attachments, wipeBraces) {
  return attachments.map(function(att) {
    return [att.title, att.path, att.mimetype].map(function(part) { return (wipeBraces ? part.replace('{', '(').replace('}', ')') : part).replace(/([\\{}:;])/g, "\\$1"); }).join(':');
  }).join(';');
}
function writeAttachments(item) {
  if(! item.attachments) { return ; }

  trLog(item.attachments.length + ' attachments');
  var attachments = [];
  var broken = [];
  item.attachments.forEach(function(att) {
    var a = {title: att.title, path: att.localPath, mimetype: att.mimeType};
    trLog(a);
    var save = (Translator.exportFileData && att.defaultPath && att.saveFile);

    if (save) { a.path = att.defaultPath; }

    if (!a.path) { return; } // amazon/googlebooks etc links show up as atachments without a path

    if (a.path.match(/[{}]/)) { // latex really doesn't want you to do this.
      broken.push(a);
      return;
    }

    if (save) { att.saveFile(att.defaultPath); }

    if (a.path) {
      attachments.push({title: att.title, path: att.localPath, mimetype: att.mimeType});
    } else {
      trLog('WARNING: attachment without path: ' + att.title);
    }
  });

  if (attachments.length != 0) {
    writeField('file', escapeAttachments(attachments, true));
  }
  if (broken.length != 0) {
    writeField('latex_doesnt_like_filenames_with_braces', escapeAttachments(broken, false));
  }
}

function trLog(msg) {
  if (typeof msg != 'string') { msg = JSON.stringify(msg); }
  Zotero.debug('[' + Translator.label + '] ' + msg);
}

function getBibTeXType(item)
{
  var type = Translator.typeMap.toBibTeX.get(item.itemType);
  if (typeof (type) == "function") { type = type(item); }
  if (!type) type = "misc";
  return type;
}

/*
 * three-letter month abbreviations. I assume these are the same ones that the
 * docs say are defined in some appendix of the LaTeX book. (i don't have the
 * LaTeX book.)
 */
var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function minimal_escape(url) {
  var href = url.replace(/([#\\_%&{}])/g, "\\$1");

  if (!Translator.unicode) {
    href = href.replace(/[^\x21-\x7E]/g, function(chr){return "\\\%" + ('00' + chr.charCodeAt(0).toString(16)).slice(-2)});
  }

  if (Translator.fancyURLs) {
    return "\\href{" + href + "}{" + LaTeX.html2latex(url) + "}";
  }

  return href;
}

function latex_escape(value, options) {
  if ((typeof options) == 'string') { options = {sep: options}; }
  if ((typeof options) == 'boolean') { options = {brace: true}; }
  options = (options || {})

  if (typeof value == 'number') { return value; }
  if (!value) { return; }

  if (value instanceof Array) {
    if (value.length == 0) { return; }
    return value.map(function(word) { return latex_escape(word, options); }).join(options.sep);
  }

  if (options.brace && !value.literal && Translator.braceAll) {
    value = {literal: value};
  }

  var doublequote = value.literal;
  value = value.literal || value;
  value = LaTeX.html2latex(value);
  if (doublequote) { value = '{' + value + '}'; }
  return value;
}

var biblatexdataRE = /biblatexdata\[([^\]]+)\]/;
function writeExtra(item, field) {
  if (!item.extra) { return; }

  var m = biblatexdataRE.exec(item.extra);
  if (m) {
    item.extra = item.extra.replace(m[0], '').trim();
    m[1].split(';').forEach(function(assignment) {
      var data = assignment.split('=', 2);
      writeField(data[0], latex_escape(data[1]));
    });
  }

  writeField(field, latex_escape(item.extra));
}

function flushEntry(item) {
  // fully empty zotero reference generates invalid bibtex. This type-reassignment does nothing but adds the single
  // field each entry needs as a minimum.
  if (Translator.fieldsWritten.length == 0) {
    writeField('type', latex_escape(getBibTeXType(item)));
  }
}

function jabrefSerialize(arr, sep, wrap) {
  return arr.map(function(v) {
    v = ('' + v).replace(/;/g, "\\;");
    if (wrap) { v = v.match(/.{1,70}/g).join("\n"); }
    return v;
  }).join(sep);
}

function exportJabRefGroups() {
  var collections = Dict({});
  var roots = [];
  var collection;
  while(collection = Zotero.nextCollection()) {
    if (collection.childItems && collection.childItems.length == 0) {
      collection.childItems = null;
    }

    // replace itemID with citation key
    if (collection.childItems) {
      collection.childItems = collection.childItems.map(function(child) { return Zotero.BetterBibTeX.KeyManager.get(child); }).filter(function(child) { return child; });
    }

    collections.set(collection.id, collection);
    roots.push(collection.id);
  }

  // walk through all collections, resolve child collections
  collections.forEach(function(collection) {
    if (collection.childCollections && collection.childCollections.length != 0) {
      collection.childCollections = collection.childCollections.map(function(id) {
        var index = roots.indexOf(id);
        if (index >= 0) { roots.splice(index, 1); }
        return collections.get(id);
      }).filter(function(child) { return child; });;
    } else {
      collection.childCollections = null;
    }
  });

  // roots now holds the IDs of the root collection, rest is resolved
  if (roots.length == 0) { return; }
  Zotero.debug('jabref groups: ' + roots.length + ' root collections');
  Zotero.write("\n\n@comment{jabref-meta: groupsversion:3;}\n\n");
  Zotero.write("\n\n@comment{jabref-meta: groupstree:\n");
  Zotero.write("0 AllEntriesGroup:;\n");

  var groups = [];
  roots.forEach(function(id) {
    groups = groups.concat(exportJabRefGroup(collections.get(id), 1));
  });
  groups = jabrefSerialize(groups, ";\n", true);
  if (groups != '') { groups += "\n"; }
  Zotero.write(groups + "}\n");
}

function exportJabRefGroup(collection, level) {
  var group = [level + ' ExplicitGroup:' + collection.name, 0];
  if (collection.childItems) {
    group = group.concat(collection.childItems);
  } else {
    group.push('');
  }
  group = jabrefSerialize(group, ';');

  var result = [group];
  if (collection.childCollections) {
    collection.childCollections.forEach(function(coll) {
      result = result.concat(exportJabRefGroup(coll, level + 1));
    });
  }

  return result;
}

/*= unicode_mapping =*/

LaTeX.toUnicode["\\url"] = '';
LaTeX.toUnicode["\\href"] = '';

LaTeX.html2latexsupport = {
  html2latex: {
    sup:      {open: "\\ensuremath{^{", close: "}}"},
    sub:      {open: "\\ensuremath{_{", close: "}}"},
    i:        {open: "\\emph{",         close: "}"},
    b:        {open: "\\textbf{",       close: "}"},
    p:        {open: "\n\n",            close: "\n\n"},
    span:     {open: "",                close: ""},
    br:       {open: "\n\n",            close: "", empty: true},
    'break':  {open: "\n\n",            close: "", empty: true}
  },

  htmlstack: [],

  htmltag: function(str) {
    var close;
    var tag = str.replace(/[^a-z]/ig, '').toLowerCase();
    var repl = LaTeX.html2latexsupport.html2latex[tag];

    // not a '/' at position 2 means it's an opening tag
    if (str.charAt(1) != '/') {
      // only add tag to the stack if it is not a self-closing tag. Self-closing tags ought to have the second-to-last
      // character be a '/', but this is not a perfect world (loads of <br>'s out there, so tags that always *ought*
      // to be empty are treated as such, regardless of whether the obligatory closing slash is present or not.
      if (str.slice(-2, 1) != '/' && !repl.empty) { LaTeX.html2latexsupport.htmlstack.unshift(tag); }
      return repl.open;
    }

    // if it's a closing tag, it ought to be the first one on the stack
    close = LaTeX.html2latexsupport.htmlstack.indexOf(tag);
    if (close < 0) {
      trLog('Ignoring unexpected close tag "' + tag + '"');
      return '';
    }

    if (close > 0) {
      trLog('Unexpected close tag "' + tag + '", closing "' + LaTeX.html2latexsupport.htmlstack.slice(0, close).join(', ') + '"');
    }

    close = LaTeX.html2latexsupport.htmlstack.slice(0, close).map(function(tag) { return html2latex[tag].close; }).join('');
    LaTeX.html2latexsupport.htmlstack = LaTeX.html2latexsupport.htmlstack.slice(close + 1);
    return repl.close;
  },

  unicode: function(str) {
    var regex = LaTeX.regex[Translator.unicode ? 'unicode' : 'ascii'];

    return str.split(regex.math).map(function(text, i) {

      var latex = text.replace(regex.text, function(match) {
        return (LaTeX.toLaTeX[match] || match);
      });

      if ((i % 2) == 1) { // odd element == splitter == block of math
        return '\\ensuremath{' + latex + '}';
      }

      return latex;

    }).join('');
  }

};

LaTeX.html2latex = function(str) {
  var tags = new RegExp('(' + Object.keys(LaTeX.html2latexsupport.html2latex).map(function(tag) { return '<\/?' + tag + '\/?>'} ).join('|') + ')', 'ig');

  return ('' + str).split(/(<pre>.*?<\/pre>)/ig).map(function(chunk, pre) {
    if ((pre % 2) == 1) { // odd element = splitter == pre block

      return chunk.replace(/^<pre>/i, '').replace(/<\/pre>$/, '');

    } else {

      LaTeX.html2latexsupport.htmlstack = [];

      var res = chunk.split(tags).map(function(chunk, htmltag) {
        if ((htmltag % 2) == 1) { // odd element = splitter == html tag

          return LaTeX.html2latexsupport.htmltag(chunk);

        } else {

          return LaTeX.html2latexsupport.unicode(chunk);

        }
      }).join('').replace(/{}\s+/g, ' ');

      if (LaTeX.html2latexsupport.htmlstack.length != 0) {
        trLog('Unmatched HTML tags: ' + LaTeX.html2latexsupport.htmlstack.join(', '));
        res += htmlstack.map(function(tag) { return LaTeX.html2latexsupport.html2latex[tag].close; }).join('');
      }

      return res;
    }
  }).join('');
}
