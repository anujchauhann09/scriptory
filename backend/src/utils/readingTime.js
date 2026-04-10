const calculateReadingTime = (content) => {
  const text = content.replace(/<[^>]*>/g, "");
  const words = text.trim().split(/\s+/).length;
  const wordsPerMinute = 200;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
};

module.exports = { calculateReadingTime };
