const slugifyLib = require("slugify");


const generateSlug = (title) => {
  return slugifyLib(title, {
    lower: true,
    strict: true,
    trim: true,
  });
};

module.exports = { generateSlug };
