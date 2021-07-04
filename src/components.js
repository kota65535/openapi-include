"use strict";

const Path = require("path").posix;
const { readYAML } = require("./yaml");
const { download } = require("./http");
const { sliceObject, parseUrl } = require("./util");

class Component {
  constructor(type, name, content, url) {
    this.type = type;
    this.name = name;
    this.content = content;
    this.url = url;
  }

  getLocalRef = () => {
    return `#/components/${this.type}/${this.name}`;
  };
}

class ComponentManager {
  constructor(nameResolver) {
    this.components = [];
    this.nameResolver = nameResolver;
  }

  get = (url) => {
    return this.components.find(
      (c) => c.url === url || c.getLocalRef() === url
    );
  };

  create = async (type, url) => {
    let name;
    if (this.nameResolver) {
      name = this.nameResolver.resolve(url);
    } else {
      name = Buffer.from(url).toString("base64");
    }
    const { isHttp, hrefWoHash, path, hash } = parseUrl(url);
    let content;
    if (isHttp) {
      content = await download(hrefWoHash);
    } else {
      content = readYAML(path);
    }
    content = sliceObject(content, hash);
    const component = new Component(type, name, content, url);
    this.components.push(component);
    return component;
  };

  getOrCreate = async (type, url) => {
    const c = this.get(url);
    if (c) {
      return c;
    }
    return await this.create(type, url);
  };

  getComponentsSection = () => {
    this.components.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type < b.type ? -1 : 1;
      }
      if (a.name !== b.name) {
        return a.name < b.name ? -1 : 1;
      }
      return 0;
    });
    const section = {};
    for (const c of this.components) {
      section[c.type] = section[c.type] || {};
      section[c.type][c.name] = c.content;
    }
    return section;
  };
}

class ComponentNameResolver {
  constructor(components) {
    this.map = this.initMap(components);
  }

  initMap(components) {
    const nameToCmps = {};
    for (const c of components) {
      const { path, hash } = parseUrl(c.url);
      const name = hash
        ? Path.basename(hash)
        : Path.basename(path, Path.extname(path));
      const key = `${name},${c.type}`;
      if (nameToCmps[key]) {
        nameToCmps[key].push(c);
      } else {
        nameToCmps[key] = [c];
      }
    }
    const cToName = {};
    for (const [key, cmps] of Object.entries(nameToCmps)) {
      const [name] = key.split(",");
      if (cmps.length === 1) {
        cToName[cmps[0].url] = name;
      } else {
        cmps.sort((f, s) => strCmp(f.url, s.url));
        for (let i = 0; i < cmps.length; i++) {
          const resolved = `${name}${i + 1}`;
          cToName[cmps[i].url] = resolved;
          console.warn(
            `conflicted component name "${name}" resolved to "${resolved}". url=${cmps[i].url}`
          );
        }
      }
    }
    return cToName;
  }

  resolve = (url) => {
    return this.map[url];
  };
}

function strCmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

module.exports = {
  ComponentManager,
  ComponentNameResolver,
};
