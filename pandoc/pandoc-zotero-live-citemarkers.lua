--
-- bbt-to-live-doc
--
-- Copyright (c) 2020 Emiliano Heyns
--
-- Permission is hereby granted, free of charge, to any person obtaining a copy of
-- this software and associated documentation files (the "Software"), to deal in
-- the Software without restriction, including without limitation the rights to
-- use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
-- of the Software, and to permit persons to whom the Software is furnished to do
-- so, subject to the following conditions:
--
-- The above copyright notice and this permission notice shall be included in all
-- copies or substantial portions of the Software.
--
-- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
-- IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
-- FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
-- AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
-- LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
-- OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
-- SOFTWARE.
--

-- local pl = require('pl.pretty') -- for pl.pretty.dump
local json = require('lunajson')
local csl_locator = require('locator')
local utils = require('utils')
local zotero = require('zotero')

-- -- global state -- --
local config = {
  client = 'zotero',
  scannable_cite = false
}

-- -- -- citation market generators -- -- --
local function zotero_ref(cite)
  local content = utils.collect(cite.content)
  local csl = {
    citationID = utils.random_id(8),
    properties = {
      formattedCitation = content,
      plainCitation = content,
      noteIndex = 0
    },
    citationItems = {},
    schema = "https://github.com/citation-style-language/schema/raw/master/csl-citation.json"
  }
  for k, item in pairs(cite.citations) do
    local itemData, zoteroData = zotero.get(item.id)
    if itemData == nil then
      return cite
    end

    if item.mode == 'AuthorInText' then -- not formally supported in Zotero
      if config.author_in_text then
        local authors = zotero.authors(itemData)
        if authors == nil then
          return cite
        else
          return pandoc.Str(authors)
        end
      else
        return cite
      end
    end
    local citation = {
      id = zoteroData.itemID,
      uris = { zoteroData.uri },
      uri = { zoteroData.uri },
      itemData = itemData,
    }

    if item.mode == 'SuppressAuthor' then
      citation['suppress-author'] = true
    end
    citation.prefix = utils.collect(item.prefix)
    local label, locator, suffix = csl_locator.parse(utils.collect(item.suffix))
    citation.suffix = suffix
    citation.label = label
    citation.locator = locator

    table.insert(csl.citationItems, citation)
  end

  if config.format == 'docx' then
    local field = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">'
    field = field .. ' ADDIN ZOTERO_ITEM CSL_CITATION ' .. utils.xmlescape(json.encode(csl)) .. '   '
    field = field .. '</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:noProof/></w:rPr><w:t>'
    field = field .. utils.xmlescape('<open Zotero document preferences: ' .. utils.xmlescape(content) .. '>')
    field = field .. '</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'

    return pandoc.RawInline('openxml', field)
  else
    csl = 'ZOTERO_ITEM CSL_CITATION ' .. utils.xmlescape(json.encode(csl)) .. ' RND' .. utils.random_id(10)
    local field = '<text:reference-mark-start text:name="' .. csl .. '"/>'
    field = field .. utils.xmlescape('<open Zotero document preferences: ' .. utils.xmlescape(content) .. '>')
    field = field .. '<text:reference-mark-end text:name="' .. csl .. '"/>'

    return pandoc.RawInline('opendocument', field)
  end
end

local function scannable_cite(cite)
  local citations = ''
  for k, item in pairs(cite.citations) do
    citation = zotero.get(item.id)
    if citation == nil then
      return cite
    end

    if item.mode == 'AuthorInText' then -- not formally supported in Zotero
      if config.author_in_text then
        local authors = zotero.authors(citation)
        if authors == nil then
          return cite
        else
          return pandoc.Str(authors)
        end
      else
        return cite
      end
    end

    local suppress = (item.mode == 'SuppressAuthor' and '-' or '')
    local s, e, ug, id, key
    s, e, key = string.find(citation.uri, 'http://zotero.org/users/local/%w+/items/(%w+)')
    if key then
      ug = 'users'
      id = '0'
    else
      s, e, ug, id, key = string.find(citation.uri, 'http://zotero.org/(%w+)/(%w+)/items/(%w+)')
    end

    local label, locator, suffix = csl_locator.parse(utils.collect(item.suffix))
    if locator then
      locator = (label or 'p.') .. ' ' .. locator
    else
      locator = ''
    end
      
    citations = citations ..
      '{ ' .. (utils.collect(item.prefix)  or '') ..
      ' | ' .. suppress .. utils.trim(string.gsub(utils.collect(cite.content) or '', '[|{}]', '')) ..
      ' | ' .. locator ..
      ' | ' .. (suffix or '') ..
      ' | ' .. (ug == 'groups' and 'zg:' or 'zu:') .. id .. ':' .. key .. ' }'
  end

  return pandoc.Str(citation)
end

-- -- -- get config -- -- --
local function test_enum(k, v, values)
  for _, valid in ipairs(values) do
    if type(v) ~= type(valid) then
      error(k .. ' expects an ' .. type(valid) .. ', got an ' .. type(v))
    end

    if v == valid then return v end
  end

  error(k .. ' expects one of ' .. table.concat(values, ', ') .. ', got ' .. v)
end
local function test_boolean(k, v)
  if type(v) == 'boolean' then
    return v
  elseif type(v) == 'nil' then
    return false
  end
  return (test_enum(k, v, {'true', 'false'}) == 'true')
end

function Meta(meta)
  -- create meta.zotero if it does not exist
  if meta.zotero == nil then
    meta.zotero = {}
  end

  -- copy meta.zotero_<key>, which are likely command line params and take precedence, over to meta.zotero
  for k, v in pairs(meta) do
    local s, e, key = string.find(k, '^zotero[-_](.*)')
    if key then
      meta.zotero[key:gsub('_', '-')] = v
    end
  end

  -- normalize values
  for k, v in pairs(meta.zotero) do
    meta.zotero[k] = utils.collect(v)
  end

  config.scannable_cite = test_boolean(meta.zotero['scannable-cite'])
  config.author_in_text = test_boolean(meta.zotero['author-in-text'])

  if type(meta.zotero.client) == 'nil' then
    meta.zotero.client = 'zotero'
  else
    test_enum('client', meta.zotero.client, {'zotero', 'jurism'})
  end
  config.client = meta.zotero.client

  if config.client == 'zotero' then
    zotero.url = 'http://127.0.0.1:23119/better-bibtex/export/item?pandocFilterData=true'
  elseif config.client == 'jurism' then
    zotero.url = 'http://127.0.0.1:24119/better-bibtex/export/item'
  end

  if string.match(FORMAT, 'odt') and config.scannable_cite then
    config.format = 'scannable-cite'
    zotero.url = zotero.url .. '&translator=jzon'
    csl_locator.short_labels()
  elseif string.match(FORMAT, 'odt') or string.match(FORMAT, 'docx') then
    config.format = FORMAT
    zotero.url = zotero.url .. '&translator=json'
  end

  if type(meta.zotero.library) ~= 'nil' then
    zotero.url = zotero.url .. '&library=' .. utils.urlencode(meta.zotero.library)
  end

  zotero.url = zotero.url .. '&citationKeys='
end

-- -- -- replace citations -- -- --
function Inlines_collect_citekeys(inlines)
  if not config.format then return inlines end

  for k, v in pairs(inlines) do
    if v.t == 'Cite' then
      for _, item in pairs(v.citations) do
        zotero.citekeys[item.id] = true
      end
    end
  end

  return inlines
end

function Inlines_replace_cites(inlines)
  if not config.format then return inlines end

  for k, v in pairs(inlines) do
    if v.t == 'Cite' then
      if zotero.format == 'scannable-cite' then
        inlines[k] = scannable_cite(v)
      else
        inlines[k] = zotero_ref(v)
      end
    end
  end

  return inlines
end


return {
  { Meta = Meta },
  { Inlines = Inlines_collect_citekeys },
  { Inlines = Inlines_replace_cites },
}
