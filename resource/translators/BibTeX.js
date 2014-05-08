/*= dict =*/

function int2str(i) {
  switch (typeof i) {
    case 'number':
    case 'string':
      return '' + i;
  }

  throw new TypeError('int2str accepts only ints, ' + (typeof i) + ' passed');
}

var Config = {
  id: '/*= id =*/',
  label:  '/*= label =*/',
  unicode:  /*= unicode =*/,
  release:  '/*= release =*/',

  initialize: function(options) {
    if (!options && Config.initialized) { return; }
    options = options || {};

    Config.pattern    = options.pattern   || Zotero.getHiddenPref('better-bibtex.citeKeyFormat');
    Config.skipFields = options.skipField || Zotero.getHiddenPref('better-bibtex.skipfields').split(',');
    Config.usePrefix  = options.usePrefix || Zotero.getHiddenPref('better-bibtex.useprefix');
    Config.braceAll   = options.braceAll  || Zotero.getHiddenPref('better-bibtex.brace-all');
    Config.fancyURLs  = options.fancyURLs || Zotero.getHiddenPref('better-bibtex.fancyURLs');

    Config.useJournalAbbreviation = options.useJournalAbbreviation  || Zotero.getOption('useJournalAbbreviation');
    Config.exportCharset          = options.exportCharset           || Zotero.getOption('exportCharset');
    Config.exportFileData         = options.exportFileData          || Zotero.getOption('exportFileData');
    Config.exportNotes            = options.exportNotes             || Zotero.getOption('exportNotes');

    switch (Zotero.getHiddenPref('better-bibtex.unicode')) {
      case 'always':
        Config.unicode = true;
        break;
      case 'never':
        Config.unicode = false;
        break;
      default:
        var charset = Config.exportCharset;
        Config.unicode = Config.unicode || (charset && charset.toLowerCase() == 'utf-8');
        break;
    }

    if (Config.typeMap.toBibTeX) {
      Config.typeMap.toZotero = Dict({});
      Config.typeMap.toBibTeX.forEach(function(zotero, bibtex) {
        if (!(bibtex instanceof Array)) { bibtex = [bibtex]; }

        bibtex = bibtex.map(function(tex) {
          if (!Config.typeMap.toZotero.has(tex) || tex.match(/^:/)) {
            Config.typeMap.toZotero.set(tex.replace(/^:/, ''), zotero);
          }
          return tex.replace(/^:/, '');
        });

        Config.typeMap.toBibTeX.set(zotero, bibtex[0]);
      });
    }

    Config.usePrefix = Zotero.getHiddenPref('better-bibtex.useprefix');

    trLog('Configured: ' + JSON.stringify(Config));
    Config.initialized = true;
  },

  typeMap: {},
  fieldsWritten: Dict({})
};

function writeFieldMap(item, fieldMap) {
  fieldMap.forEach(function(bibtexField, zoteroField) {
    var brace = !!(zoteroField.literal);
    zoteroField = zoteroField.literal ? zoteroField.literal : zoteroField;

    if(item[zoteroField]) {
      value = item[zoteroField];
      if (bibtexField == 'url') {
        writeField(bibtexField, escape_url(value));
      } else {
        writeField(bibtexField, escape(value, {brace: brace}));
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

  if (Config.fieldsWritten.has(field)) { trLog('Field ' + field + ' output more than once!'); }
  Config.fieldsWritten.set(field, true);
  Zotero.write(",\n\t" + field + " = " + value);
}


function saveAttachments(item) {
  if(! item.attachments) {
    return null;
  }

  var attachments = [];
  item.attachments.forEach(function(att) {
    if (Config.exportFileData && att.defaultPath && att.saveFile) {
      att.saveFile(att.defaultPath);
      attachments.push({title: att.title, path: att.defaultPath, mimetype: att.mimeType});
      return;
    }

    if (att.localPath) {
      attachments.push({title: att.title, path: att.localPath, mimetype: att.mimeType});
      return;
    }

    Zotero.debug('WARNING: attachment without path: ' + att.title);
  });

  if (attachments.length == 0) {
    return null;
  }
  return attachments.map(function(att) { return [att.title, att.path.replace(/([\\{}:;])/g, "\\$1"), att.mimetype].join(':'); }).join(';');
}

function trLog(msg) { Zotero.debug('[' + Config.label + '] ' + msg); }

function getBibTexType(item)
{
  var type = Config.typeMap.toBibTeX.get(item.itemType);
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

function escape_url(url) {
  var href = url.replace(/([#\\_%&{}])/g, "\\$1");

  if (!Config.unicode) {
    href = href.replace(/[^\x21-\x7E]/g, function(chr){return "\\\%" + ('00' + chr.charCodeAt(0).toString(16)).slice(-2)});
  }

  if (Config.fancyURLs) {
    return "\\href{" + href + "}{" + LaTeX.html2latex(url) + "}";
  }

  return href;
}

function escape(value, options) {
  if ((typeof options) == 'string') { options = {sep: options}; }
  if ((typeof options) == 'boolean') { options = {brace: true}; }
  options = (options || {})

  if (typeof value == 'number') { return value; }
  if (!value) { return; }

  if (value instanceof Array) {
    if (value.length == 0) { return; }
    return value.map(function(word) { return escape(word, options); }).join(options.sep);
  }

  if (options.brace && !value.literal && Config.braceAll) {
    value = {literal: value};
  }

  var doublequote = value.literal;
  value = value.literal || value;
  value = LaTeX.html2latex(value);
  if (doublequote) { value = '{' + value + '}'; }
  return value;
}

function mapHTMLmarkup(characters){
  //converts the HTML markup allowed in Zotero for rich text to TeX
  //since  < and > have already been escaped, we need this rather hideous code - I couldn't see a way around it though.
  //italics and bold
  characters = characters.replace(/\{\\textless\}i\{\\textgreater\}(.+?)\{\\textless\}\/i{\\textgreater\}/g, "\\textit{$1}")
    .replace(/\{\\textless\}b\{\\textgreater\}(.+?)\{\\textless\}\/b{\\textgreater\}/g, "\\textbf{$1}");
  //sub and superscript
  characters = characters.replace(/\{\\textless\}sup\{\\textgreater\}(.+?)\{\\textless\}\/sup{\\textgreater\}/g, "\$^{\\textrm{$1}}\$")
    .replace(/\{\\textless\}sub\{\\textgreater\}(.+?)\{\\textless\}\/sub\{\\textgreater\}/g, "\$_{\\textrm{$1}}\$");
  //two variants of small caps
  characters = characters.replace(/\{\\textless\}span\sstyle=\"small\-caps\"\{\\textgreater\}(.+?)\{\\textless\}\/span{\\textgreater\}/g, "\\textsc{$1}")
    .replace(/\{\\textless\}sc\{\\textgreater\}(.+?)\{\\textless\}\/sc\{\\textgreater\}/g, "\\textsc{$1}");
  return characters;
}


function mapTeXmarkup(tex){
  //reverse of the above - converts tex mark-up into html mark-up permitted by Zotero
  //italics and bold
  tex = tex.replace(/\\textit\{([^\}]+\})/g, "<i>$1</i>").replace(/\\textbf\{([^\}]+\})/g, "<b>$1</b>");
  //two versions of subscript the .* after $ is necessary because people m
  tex = tex.replace(/\$[^\{\$]*_\{([^\}]+\})\$/g, "<sub>$1</sub>").replace(/\$[^\{]*_\{\\textrm\{([^\}]+\}\})/g, "<sub>$1</sub>");
  //two version of superscript
  tex = tex.replace(/\$[^\{]*\^\{([^\}]+\}\$)/g, "<sup>$1</sup>").replace(/\$[^\{]*\^\{\\textrm\{([^\}]+\}\})/g, "<sup>$1</sup>");
  //small caps
  tex = tex.replace(/\\textsc\{([^\}]+)/g, "<span style=\"small-caps\">$1</span>");
  return tex;
}

var biblatexdataRE = /biblatexdata\[([^\]]+)\]/;
function writeExtra(item, field) {
  if (!item.extra) { return; }

  var m = biblatexdataRE.exec(item.extra);
  if (m) {
    item.extra = item.extra.replace(m[0], '').trim();
    m[1].split(';').forEach(function(assignment) {
      var data = assignment.split('=', 2);
      writeField(data[0], escape(data[1]));
    });
  }

  writeField(field, escape(item.extra));
}

function flushEntry(item) {
  // fully empty zotero reference generates invalid bibtex. This type-reassignment does nothing but adds the single
  // field each entry needs as a minimum.
  if (Config.fieldsWritten.size == 0) {
    writeField('type', escape(getBibTexType(item)));
  }
}

Formatter = {
  item: null,

  getCreators: function(onlyEditors) {
    if(!Formatter.item.creators || !Formatter.item.creators.length) { return []; }
    var creators = {};
    var primaryCreatorType = Zotero.Utilities.getCreatorsForType(Formatter.item.itemType)[0];
    var creator;
    Formatter.item.creators.forEach(function(creator) {
      var name = ('' + creator.lastName).trim();
      if (name != '') {
        switch (creator.creatorType) {
          case 'editor':
          case 'seriesEditor':
            if (!creators.editors) { creators.editors = []; }
            creators.editors.push(name);
            break;
          case 'translator':
            if (!creators.translators) { creators.translators = []; }
            creators.translators.push(name);
            break;
          case primaryCreatorType:
            if (!creators.authors) { creators.authors = []; }
            creators.authors.push(name);
            break;
          default:
            if (!creators.collaborators) { creators.collaborators = []; }
            creators.collaborators.push(name);
        }
      }
    });

    if (onlyEditors) { return creators.editors; }
    return creators.authors || creators.editors || creators.collaborators || creators.translators || null;
  },

  words: function(str) {
    return str.split(/\s+/).filter(function(word) { return (word != '');}).map(function (word) { return CiteKeys.clean(word) });
  },

  skipWords: [
    'a',
    'aboard',
    'about',
    'above',
    'across',
    'after',
    'against',
    'al',
    'along',
    'amid',
    'among',
    'an',
    'and',
    'anti',
    'around',
    'as',
    'at',
    'before',
    'behind',
    'below',
    'beneath',
    'beside',
    'besides',
    'between',
    'beyond',
    'but',
    'by',
    'd',
    'das',
    'de',
    'del',
    'der',
    'des',
    'despite',
    'die',
    'do',
    'down',
    'during',
    'ein',
    'eine',
    'einem',
    'einen',
    'einer',
    'eines',
    'el',
    'except',
    'for',
    'from',
    'in',
    'is',
    'inside',
    'into',
    'l',
    'la',
    'las',
    'le',
    'like',
    'los',
    'near',
    'nor',,
    'of',
    'off',
    'on',
    'onto',
    'or',
    'over',
    'past',
    'per',
    'plus',
    'round',
    'save',
    'since',
    'so',
    'some',
    'than',
    'the',
    'through',
    'to',
    'toward',
    'towards',
    'un',
    'una',
    'unas',
    'under',
    'underneath',
    'une',
    'unlike',
    'uno',
    'unos',
    'until',
    'up',
    'upon',
    'versus',
    'via',
    'while',
    'with',
    'within',
    'without',
    'yet'
  ],

  titleWords: function(title, options) {
    if (!title) { return null; }

    var _words = Formatter.words(title);

    options = options || {};
    if (options.asciiOnly) { _words = _words.map(function (word) { return word.replace(/[^a-zA-Z]/, ''); }); }
    _words = _words.filter(function(word) { return (word != ''); });
    if (options.skipWords) { _words = _words.filter(function(word) { return (Formatter.skipWords.indexOf(word.toLowerCase()) == -1); }); }
    if (_words.length == 0) { return null; }
    return _words;
  },

  functions: {
    id: function() {
      return Formatter.item.itemID;
    },

    key: function() {
      return Formatter.item.key;
    },

    auth: function(onlyEditors, n, m) {
      var authors = Formatter.getCreators(onlyEditors);
      if (!authors) { return ''; }

      var author = authors[m || 0];
      if (author && n) { author = author.substring(0, n); }
      return (author || '');
    },

    type: function() {
      return getBibTexType(Formatter.item);
    },

    authorLast: function(onlyEditors) {
      var authors = Formatter.getCreators(onlyEditors);
      if (!authors) { return ''; }

      return (authors[authors.length - 1] || '');
    },

    authors: function(onlyEditors, n) {
      var authors = Formatter.getCreators(onlyEditors);
      if (!authors) { return ''; }

      if (n) {
        var etal = (authors.length > n);
        authors = authors.slice(0, n);
        if (etal) { authors.push('EtAl'); }
      }
      authors = authors.join('.');
      return authors;
    },

    authorsAlpha: function(onlyEditors) {
      var authors = Formatter.getCreators(onlyEditors);
      if (!authors) { return ''; }

      switch (authors.length) {
        case 1:
          return authors[0].substring(0, 3);
        case 2:
        case 3:
        case 4:
          return authors.map(function(author) { return author.substring(0, 1); }).join('');
        default:
          return authors.slice(0, 3).map(function(author) { return author.substring(0, 1); }).join('') + '+';
      }
    },

    authIni: function(onlyEditors, n) {
      var authors = Formatter.getCreators(onlyEditors);
      if (!authors) { return ''; }

      return authors.map(function(author) { return author.substring(0, n); }).join('.');
    },

    authorIni: function(onlyEditors) {
      var authors = Formatter.getCreators(onlyEditors);
      if (!authors) { return ''; }

      var firstAuthor = authors.shift();

      return [firstAuthor.substring(0, 5)].concat(authors.map(function(author) {
        return auth.split(/\s+/).map(function(name) { return name.substring(0, 1); }).join('');
      })).join('.');
    },

    'auth.auth.ea': function(onlyEditors) {
      var authors = Formatter.getCreators(onlyEditors);
      if (!authors) { return ''; }

      return authors.slice(0,2).concat(authors.length > 2 ? ['ea'] : []).join('.')
    },

    'auth.etal': function(onlyEditors) {
      var authors = Formatter.getCreators(onlyEditors);
      if (!authors) { return ''; }

      if (authors.size == 2) { return authors.join('.'); }

      return authors.slice(0,1).concat(authors.length > 1 ? ['etal'] : []).join('.')
    },

    authshort: function(onlyEditors) {
      var authors = Formatter.getCreators(onlyEditors);
      if (!authors) { return ''; }

      switch (authors.length) {
        case 0:   return '';
        case 1:   return authors[0];
        default:  return authors.map(function(author) { return author.substring(0, 1); }).join('.') + (authors.length > 3 ? '+' : '');
      }
    },

    firstpage: function() {
      if (!Formatter.item.pages) { return '';}
      var firstpage = '';
      Formatter.item.pages.replace(/^([0-9]+)/, function(match, fp) { firstpage = fp; });
      return firstpage;
    },

    keyword: function(dummy, n) {
      if (!Formatter.item.tags || !Formatter.item.tags[n]) { return ''; }
      return Formatter.item.tags[n].tag;
    },

    lastpage: function() {
      if (!Formatter.item.pages) { return '';}
      var lastpage = '';
      Formatter.item.pages.replace(/([0-9]+)[^0-9]*$/, function(match, lp) { lastpage = lp; });
      return lastpage;
    },

    shorttitle: function() {
      var words = Formatter.titleWords(Formatter.item.title, {skipWords: true, asciiOnly: true});
      if (!words) { return ''; }
      return words.slice(0,3).join('');
    },

    veryshorttitle: function() {
      var words = Formatter.titleWords(Formatter.item.title, {skipWords: true, asciiOnly: true});
      if (!words) { return ''; }
      return words.slice(0,1).join('');
    },

    shortyear: function() {
      if (!Formatter.item.date) { return ''; }
      var date = Zotero.Utilities.strToDate(Formatter.item.date);
      if (typeof date.year === 'undefined') { return ''; }
      var year = date.year % 100;
      if (year < 10) { return '0' + year; }
      return year + '';
    },

    year: function() {
      if (!Formatter.item.date) { return ''; }
      var date = Zotero.Utilities.strToDate(Formatter.item.date);
      if (typeof date.year === 'undefined') { return Formatter.item.date; }
      return date.year;
    },

    month: function() {
      if (!Formatter.item.date) { return ''; }
      var date = Zotero.Utilities.strToDate(Formatter.item.date);
      if (typeof date.year === 'undefined') { return ''; }
      return (months[date.month] || '');
    },

    title: function() {
      return Formatter.titleWords(Formatter.item.title).join('');
    }
  },

  filters: {
    condense: function(value) {
      return value.replace(/\s/, '');
    },

    abbr: function(value) {
      return value.split(/\s+/).map(function(word) { return word.substring(0, 1); }).join('');
    },

    lower: function(value) {
      return value.toLowerCase();
    },

    upper: function(value) {
      return value.toUpperCase();
    }
  },

  function_N_M: /^([^0-9]+)([0-9]+)_([0-9]+)$/,
  function_N: /^([^0-9]+)([0-9]+)$/,

  format: function(item) {
    Formatter.item = item;

    var citekey = '';

    Config.pattern.split('|').some(function(pattern) {
      citekey = pattern.replace(/\[([^\]]+)\]/g, function(match, command) {
        var _filters = command.split(':');
        var _function = _filters.shift();
        var _property = _function;

        var N;
        var M;
        var match;

        if (match = Formatter.function_N_M.exec(_function)) {
          _function = match[1];
          N = parseInt(match[2]);
          M = parseInt(match[3]);
        } else if (match = Formatter.function_N.exec(_function)) {
          _function = match[1];
          N = parseInt(match[2]);
          M = null;
        } else {
          N = null;
          M = null;
        }

        var onlyEditors = (_function.match(/^edtr/) || _function.match(/^editors/));
        _function = _function.replace(/^edtr/, 'auth').replace(/^editors/, 'authors');

        var value = '';
        if (Formatter.functions[_function]) {
          value = Formatter.functions[_function](onlyEditors, N, M);
        }

        if (value == '' && Formatter.item[_property] && (typeof Formatter.item[_property] != 'function')) {
          value = '' + Formatter.item[_property];
        }

        if (value == '' && !Formatter.functions[_function]) {
          trLog('requested non-existent item function ' + _property);
        }

        _filters.forEach(function(filter) {
          if (filter.match(/^[(].*[)]$/)) { // text between braces is default value in case a filter or function fails
            if (value == '') { value = filter.substring(1, filter.length - 2); }
          } else if (Formatter.filters[filter]) {
            value = Formatter.filters[filter](value);
          } else {
            trLog('requested non-existent item filter ' + filter);
            value = '';
          }
        });

        return value;
      });

      return citekey != '';
    });

    if (citekey == '') { citekey = 'zotero-' + Formatter.item.key; }

    return citekey;
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
    if (collection.childItems && collection.childItems.size != 0) {
      // replace itemID with citation key
      collection.childItems = collection.childItems.map(function(child) {return CiteKeys.itemId2citeKey.get(child)}).filter(function(child) { return child; });
    } else {
      collection.childItems = null;
    }
    collections.set(int2str(collection.id), collection);
    roots.push(collection.id);
  }
  if (collections.size == 0) {
    return;
  }

  // walk through all collections, resolve child collections
  collections.forEach(function(collection) {
    if (collection.childCollections && collection.childCollections.size != 0) {
      collection.childCollections = collection.childCollections.map(function(id) {
        var index = roots.indexOf(id);
        if (index > -1) { roots.splice(index, 1); }
        return collections.get(int2str(id));
      }).filter(function(child) { return child; });;
    } else {
      collection.childCollections = null;
    }
  });

  // roots now holds the IDs of the root collection, rest is resolved
  Zotero.write("\n\n@comment{jabref-meta: groupsversion:3;}\n\n");
  Zotero.write("\n\n@comment{jabref-meta: groupstree:\n");
  Zotero.write("0 AllEntriesGroup:;\n");

  var groups = [];
  roots.forEach(function(id) {
    groups = groups.concat(exportJabRefGroup(collections.get(int2str(id)), 1));
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

var CiteKeys = {
  keys: Dict({}),
  items: Dict({}),
  itemId2citeKey: Dict({}),

  embeddedKeyRE: /bibtex:\s*([^\s\r\n]+)/,
  andersJohanssonKeyRE: /biblatexcitekey\[([^\]]+)\]/,
  unsafechars: /[^-_a-z0-9!\$\*\+\.\/:;\?\[\]]/ig,

  initialize: function(items) {
    Config.initialize();

    if (!items) {
      var _items = Dict({});
      var item;
	    while (item = Zotero.nextItem()) {
        if (item.itemType == ':test:options:') {
          Config.initialize(item);
        } else {
          _items.set(int2str(item.itemID), item); // duplicates?!
        }
      }
      items = [];
      _items.forEach(function(item) { items.push(item); });
    }

    var generate = [];

    items.forEach(function(item) {
      if (item.itemType == "note" || item.itemType == "attachment") return;

      // all pinned items first. Do *not* call for thise in generate yet, as this would register them!
      if (CiteKeys.embeddedKeyRE.exec(item.extra)) {
        CiteKeys.items.set(int2str(item.itemID), {key: CiteKeys.build(item)});
      } else {
        generate.push(item);
      }
    });

    generate.forEach(function(item) {
      CiteKeys.items.set(int2str(item.itemID), {key: CiteKeys.build(item)});
    });

    CiteKeys.keys.forEach(function(key) {
      key.duplicates.forEach(function(source) {
        if (source.pinned) {
          CiteKeys.items.get(source.itemID).pinned = true;
        } else {
          if (CiteKeys.items.get(source.itemID).key != key.original) {
            CiteKeys.items.get(source.itemID).default = key.original;
          }
        }

        key.duplicates.forEach(function(target) {
          if (source.itemID != target.itemID) {
            CiteKeys.items.get(source.itemID).duplicates = CiteKeys.items.get(source.itemID).duplicates || [];
            CiteKeys.items.get(source.itemID).duplicates.push(target.itemID);
          }
        });
      });
    });

    return items;
  },

  extract: function(item) {
    if (!item.extra) { return null; }

    var m = CiteKeys.embeddedKeyRE.exec(item.extra) || CiteKeys.andersJohanssonKeyRE.exec(item.extra);
    if (!m) { return null; }

    item.extra = item.extra.replace(m[0], '').trim();
    var key = m[1];
    if (CiteKeys.keys.has(key)) { trLog('BibTex export: duplicate key ' + key); }
    return key;
  },

  register: function(item, key, pinned) {
    var postfix;

    if (CiteKeys.keys.has(key)) {
      CiteKeys.keys.get(key).duplicates.push({itemID: int2str(item.itemID), pinned: pinned});
      if (pinned) { return key; }
      postfix = {n: 0, c:'a'};
      while (CiteKeys.keys.has(key + postfix.c)) {
        postfix.n++;
        postfix.c = String.fromCharCode('a'.charCodeAt() + postfix.n)
      }
      postfix = postfix.c;
    } else {
      postfix = '';
    }
    CiteKeys.keys.set(key + postfix, {original: key, duplicates: [{itemID: int2str(item.itemID), pinned: pinned}]});
    CiteKeys.itemId2citeKey.set(int2str(item.itemID), key + postfix);
    return key + postfix;
  },

  clean: function(str) {
    str = ZU.removeDiacritics(str).replace(CiteKeys.unsafechars, '').trim();
    return str;
  },

  build: function(item) {
    var citekey = CiteKeys.extract(item);
    if (citekey) { return CiteKeys.register(item, citekey, true); }

    return CiteKeys.register(item, CiteKeys.clean(Formatter.format(item)));
  }
};

/*= unicode_mapping =*/

LaTeX.toUnicode["\\url"] = '';
LaTeX.toUnicode["\\href"] = '';

LaTeX.html2latex = function(str) {
  var regex = LaTeX.regex[Config.unicode ? 'unicode' : 'ascii'];

  var html2latex = {
    sup:      {open: "\\ensuremath{^{", close: "}}"},
    sub:      {open: "\\ensuremath{_{", close: "}}"},
    i:        {open: "\\emph{",         close: "}"},
    b:        {open: "\\textbf{",       close: "}"},
    p:        {open: "\n\n",            close: "\n\n"},
    span:     {open: "",                close: ""},
    br:       {open: "\n\n",            close: "", empty: true},
    'break':  {open: "\n\n",            close: "", empty: true}
  };

  var tags = new RegExp('(' + Object.keys(html2latex).map(function(tag) { return '<\/?' + tag + '\/?>'} ).join('|') + ')', 'ig');

  var htmlstack = [];
  var close;

  var res = ('' + str).split(tags).map(function(chunk, index) {
    if ((index % 2) == 1) { // odd element = splitter == html tag

      var tag = chunk.replace(/[^a-z]/ig, '').toLowerCase();
      var repl = html2latex[tag];

      // not a '/' at position 2 means it's an opening tag
      if (chunk.charAt(1) != '/') {
        // only add tag to the stack if it is not a self-closing tag. Self-closing tags ought to have the second-to-last
        // character be a '/', but this is not a perfect world (loads of <br>'s out there, so tags that always *ought*
        // to be empty are treated as such, regardless of whether the obligatory closing slash is present or not.
        if (chunk.slice(-2, 1) != '/' && !repl.empty) { htmlstack.unshift(tag); }
        return repl.open;
      }

      // if it's a closing tag, it ought to be the first one on the stack
      close = htmlstack.indexOf(tag);
      if (close < 0) {
        trLog('Ignoring unexpected close tag "' + tag + '"');
        return '';
      }

      if (close > 0) {
        trLog('Unexpected close tag "' + tag + '", closing "' + htmlstack.slice(0, close).join(', ') + '"');
      }

      close = htmlstack.slice(0, close).map(function(tag) { return html2latex[tag].close; }).join('');
      htmlstack = htmlstack.slice(close + 1);
      return repl.close;

    } else {

      return chunk.split(regex.math).map(function(text, i) {

        var latex = text.replace(regex.text, function(match) {
          return (LaTeX.toLaTeX[match] || match);
        });

        if ((i % 2) == 1) { // odd element == splitter == block of math
          return '\\ensuremath{' + latex + '}';
        }

        return latex;

      }).join('');
    }
  }).join('').replace(/{}\s+/g, ' ');

  if (htmlstack.length != 0) {
    trLog('Unmatched HTML tags: ' + htmlstack.join(', '));
    res += htmlstack.map(function(tag) { return html2latex[tag].close; }).join('');
  }

  return res;
}

LaTeX.latex2html = function(str) {
  var chunks = str.split('\\');
  var res = chunks.shift();
  var m, i, c, l;

  chunks.forEach(function(chunk) {
    chunk = '\\' + chunk;
    l = chunk.length;
    m = null;
    for (i=2; i<=l; i++) {
      if (LaTeX.toUnicode[chunk.substring(0, i)]) {
        m = i;
      } else {
        break;
      }
    }

    if (m) {
      res += LaTeX.toUnicode[chunk.substring(0, m)] + chunk.substring(m, chunk.length);
    } else {
      res += chunk;
    }
  });

  res = res.replace(/[\r\n\t ]+/gm, ' ').trim();

  return res;
}
