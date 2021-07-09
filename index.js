#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require("fs/promises");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

function exit(msg) {
  msg = msg || 'node index.js [-o output_file] input_file';
  console.log(msg);
  process.exit(1);
}

let FILENAME;
let OUTPUT;

// parse command line
switch (process.argv.length) {
  case 3:
    FILENAME = process.argv[2];
    if (FILENAME == "-o") exit();
    break;
  case 5:
    FILENAME = process.argv[4];
    OUTPUT   = process.argv[3];
    if (process.argv[2] != "-o") exit();
    break;
  default:
    exit();
}

const INPUT_URL = `file:///${process.cwd()}/${FILENAME}`;

// is MathJax done doing its processing?
async function mathjax_ready(page) {
  const msg = await page.$$eval('#MathJax_Message', (message) => {
    return message.map((option) => option.outerHTML)[0];
  });
  if (!msg) return false;
  return (msg && msg.indexOf('><') !== -1);
}

// grab all mathml content from the document processed by MathJax
async function mathjax_mathml(page) {
  return page.$$eval('*[data-mathml]', (message) => {
    return message.map((option) => option.getAttribute('data-mathml'));
  });
}

// replace the element content with the MathML content into a new document
async function tex2mathml(mathml) {
  const data = await fs.readFile(FILENAME);
  const dom = (new JSDOM(data, {
    url: INPUT_URL
  }));
  // console.log(dom.serialize());
  const elements = dom.window.document.querySelectorAll(".math");
  if (mathml.length === elements.length) {
    for (let index = 0; index < elements.length; index++) {
      const element = elements[index];
      element.innerHTML = mathml[index];
    }
    if (OUTPUT) {
      fs.writeFile(OUTPUT, dom.serialize()).catch(err => {
        exit(err);
      });
    } else {
      console.log(dom.serialize());
    }
  } else {
    exit(`Inconsistency detected: found ${mathml.length} MathML fragments for ${elements.length} *.math elements`)
  }
}

// load the document, grab the mathml, and dump the replacements into a new document
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(INPUT_URL);

  let counter = 0;
  function loop() {
    counter++;
    mathjax_ready(page).then(ready => {
      if (!ready && counter != 10) {
        setTimeout(loop, 2000);
      } else {
        if (counter >= 10) exit("MathJax takes more 20 seconds. Report a bug to tex2mathml.")
        mathjax_mathml(page).then(math => {
          browser.close();
          tex2mathml(math);
        });
      }
    })
  }

    setTimeout(loop, 0);
})();
