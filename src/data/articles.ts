export interface Article {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  date: string;
  author: string;
  tags: string[];
  coverImage: string;
  excerpt: string;
  content: string;
}

export const articles: Article[] = [
  {
    id: "1",
    title: "Git for Beginners: Stop Being Scared of Version Control",
    subtitle: "A friendly, no-jargon guide to Git — the tool every developer needs.",
    slug: "git-for-beginners",
    date: "2024-03-10",
    author: "Anuj Chauhan",
    tags: ["Git", "Beginner", "DevTools"],
    coverImage: "/git-cover.png",
    excerpt: "Git feels intimidating at first — cryptic commands, merge conflicts, detached HEADs. But once it clicks, you'll wonder how you ever coded without it. Let's break it down from scratch.",
    content: `
<h2>Why Git Exists (and Why You Need It)</h2>
<p>Imagine you're writing an essay. You save it as <code>essay_final.docx</code>, then <code>essay_final_v2.docx</code>, then <code>essay_ACTUALLY_final.docx</code>. Sound familiar? Git solves exactly this problem — but for code, and in a much smarter way.</p>

<p>Git is a <strong>version control system</strong>. It tracks every change you make to your code, lets you go back in time, and allows multiple people to work on the same project without stepping on each other's toes.</p>

<blockquote>"Git is like a save button that remembers every single save you've ever made — and lets you jump back to any of them."</blockquote>

<h2>Installing Git</h2>
<p>Head to <a href="https://git-scm.com" target="_blank">git-scm.com</a> and download Git for your OS. Once installed, open your terminal and verify:</p>

<pre><code class="language-bash">git --version
# git version 2.43.0</code></pre>

<h2>The Three Zones You Must Understand</h2>
<p>Before any commands make sense, you need to understand Git's three zones:</p>

<ul>
  <li><strong>Working Directory</strong> — your actual files on disk. This is where you edit code.</li>
  <li><strong>Staging Area (Index)</strong> — a "draft" of your next save. You choose exactly which changes go in.</li>
  <li><strong>Repository (.git folder)</strong> — the permanent history. Once committed, it's locked in.</li>
</ul>

<p>Think of it like packing a suitcase. Your room is the working directory (messy, everything everywhere). The staging area is what you've laid out on the bed to pack. The suitcase is the commit — zipped up and ready to go.</p>

<h2>Your First Git Workflow</h2>
<p>Let's walk through the most common daily workflow:</p>

<pre><code class="language-bash"># 1. Start tracking a project
git init

# 2. Check what's changed
git status

# 3. Stage your changes
git add index.html        # stage one file
git add .                 # stage everything

# 4. Commit with a message
git commit -m "Add homepage layout"

# 5. See your history
git log --oneline</code></pre>

<h2>Branches: Work Without Fear</h2>
<p>Branches are Git's superpower. A branch is an independent copy of your code where you can experiment freely. If it works, you merge it in. If it doesn't, you delete it — no harm done.</p>

<pre><code class="language-bash"># Create and switch to a new branch
git checkout -b feature/dark-mode

# Make changes, commit them...
git add .
git commit -m "Implement dark mode toggle"

# Switch back to main
git checkout main

# Merge your feature in
git merge feature/dark-mode</code></pre>

<h2>Working with GitHub</h2>
<p>Git is local. GitHub is the cloud backup + collaboration layer. Once you create a repo on GitHub:</p>

<pre><code class="language-bash"># Link your local repo to GitHub
git remote add origin https://github.com/you/your-repo.git

# Push your code up
git push -u origin main

# Pull the latest changes from teammates
git pull origin main</code></pre>

<h2>The Commands You'll Use 90% of the Time</h2>
<p>Honestly, day-to-day Git boils down to about 8 commands:</p>

<ul>
  <li><code>git status</code> — what's changed?</li>
  <li><code>git add .</code> — stage everything</li>
  <li><code>git commit -m "message"</code> — save a snapshot</li>
  <li><code>git push</code> — upload to GitHub</li>
  <li><code>git pull</code> — download latest changes</li>
  <li><code>git checkout -b branch-name</code> — create a branch</li>
  <li><code>git merge branch-name</code> — merge a branch</li>
  <li><code>git log --oneline</code> — see history</li>
</ul>

<h2>Don't Panic: Common Mistakes Fixed</h2>
<p><strong>Committed to the wrong branch?</strong></p>
<pre><code class="language-bash">git reset HEAD~1          # undo last commit, keep changes staged</code></pre>

<p><strong>Want to discard all local changes?</strong></p>
<pre><code class="language-bash">git checkout -- .         # nuclear option — reverts everything</code></pre>

<p><strong>Merge conflict?</strong> Open the file, look for the <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> markers, pick which version you want, delete the markers, then <code>git add</code> and <code>git commit</code>.</p>

<h2>The Golden Rule</h2>
<p>Commit early, commit often. Small, focused commits with clear messages are infinitely more useful than one giant commit that says "stuff". Your future self — and your teammates — will thank you.</p>
    `,
  },
  {
    id: "2",
    title: "RAG Explained: How AI Actually Knows Your Data",
    subtitle: "Retrieval-Augmented Generation demystified — no PhD required.",
    slug: "rag-explained",
    date: "2024-05-18",
    author: "Anuj Chauhan",
    tags: ["AI", "RAG", "LLM", "Beginner"],
    coverImage: "/rag-cover.png",
    excerpt: "ChatGPT doesn't know about your company's internal docs. RAG fixes that — by giving AI a memory it can actually search. Here's how it works, explained simply.",
    content: `
<h2>The Problem with Plain LLMs</h2>
<p>Large Language Models like GPT-4 are trained on data up to a certain date. They don't know about your private documents, your company's codebase, or anything that happened after their training cutoff. Ask them about your internal API docs and they'll confidently make something up — a phenomenon called <strong>hallucination</strong>.</p>

<p>RAG — <strong>Retrieval-Augmented Generation</strong> — is the solution. Instead of relying purely on what the model memorized during training, RAG lets the model <em>look things up</em> before answering.</p>

<blockquote>"RAG is like giving your AI an open-book exam instead of a closed-book one. It can look at the relevant pages before answering."</blockquote>

<h2>How RAG Works: The Simple Version</h2>
<p>There are three steps:</p>

<ol>
  <li><strong>Ingest</strong> — Take your documents (PDFs, markdown files, database records) and split them into chunks. Convert each chunk into a vector (a list of numbers that captures meaning) using an embedding model.</li>
  <li><strong>Retrieve</strong> — When a user asks a question, convert that question into a vector too. Find the chunks whose vectors are most similar (semantically closest) to the question.</li>
  <li><strong>Generate</strong> — Stuff those relevant chunks into the LLM's context window along with the question. The model now answers based on actual, relevant information.</li>
</ol>

<h2>What's a Vector Embedding?</h2>
<p>This is the part that trips people up. An embedding is just a way to represent text as numbers so that similar meanings end up close together in mathematical space.</p>

<p>For example, the sentences "How do I reset my password?" and "I forgot my login credentials" would have very similar vectors — even though they share no words. That's the magic: <strong>semantic similarity, not keyword matching</strong>.</p>

<pre><code class="language-python"># Using OpenAI embeddings
from openai import OpenAI

client = OpenAI()

def embed(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    return response.data[0].embedding

# "cat" and "kitten" will have similar vectors
cat_vec = embed("cat")
kitten_vec = embed("kitten")
# cosine_similarity(cat_vec, kitten_vec) ≈ 0.92</code></pre>

<h2>The Vector Database</h2>
<p>You need somewhere to store and search these vectors efficiently. That's what a vector database does. Popular options include:</p>

<ul>
  <li><strong>Pinecone</strong> — managed, easy to start with</li>
  <li><strong>Chroma</strong> — open source, runs locally, great for development</li>
  <li><strong>Weaviate</strong> — open source, feature-rich</li>
  <li><strong>pgvector</strong> — if you're already using PostgreSQL</li>
</ul>

<h2>A Minimal RAG Pipeline in Python</h2>
<pre><code class="language-python">from openai import OpenAI
import chromadb

client = OpenAI()
chroma = chromadb.Client()
collection = chroma.create_collection("docs")

# 1. INGEST — add your documents
docs = [
    "Our refund policy allows returns within 30 days.",
    "To reset your password, visit /account/reset.",
    "Premium plans include unlimited API calls.",
]
embeddings = [embed(doc) for doc in docs]
collection.add(
    documents=docs,
    embeddings=embeddings,
    ids=[str(i) for i in range(len(docs))]
)

# 2. RETRIEVE — find relevant chunks
question = "How do I get my money back?"
q_embedding = embed(question)
results = collection.query(query_embeddings=[q_embedding], n_results=2)
context = "\\n".join(results["documents"][0])

# 3. GENERATE — ask the LLM with context
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": f"Answer using this context:\\n{context}"},
        {"role": "user", "content": question}
    ]
)
print(response.choices[0].message.content)
# "Our refund policy allows returns within 30 days."</code></pre>

<h2>When Should You Use RAG?</h2>
<p>RAG is the right tool when:</p>
<ul>
  <li>Your data changes frequently (fine-tuning is expensive and slow)</li>
  <li>You need the model to cite sources</li>
  <li>You're working with private/proprietary data</li>
  <li>Your knowledge base is too large to fit in a context window</li>
</ul>

<p>It's <em>not</em> a silver bullet — if your documents are poorly written or your chunking strategy is bad, the retrieval will be bad and the answers will be bad. Garbage in, garbage out still applies.</p>

<h2>The Takeaway</h2>
<p>RAG = your documents + vector search + an LLM. It's one of the most practical AI patterns you can implement today, and the building blocks are all open source and accessible. Start with Chroma locally, get it working, then scale up.</p>
    `,
  },
  {
    id: "3",
    title: "Docker for Beginners: Your App, Anywhere",
    subtitle: "Containers explained without the buzzwords — and why they changed everything.",
    slug: "docker-for-beginners",
    date: "2024-07-04",
    author: "Anuj Chauhan",
    tags: ["Docker", "DevOps", "Beginner"],
    coverImage: "/docker-cover.png",
    excerpt: "\"It works on my machine\" is the oldest excuse in software. Docker kills that excuse dead. Here's how containers work and why every developer should know them.",
    content: `
<h2>The "Works on My Machine" Problem</h2>
<p>You write code on your MacBook. It works perfectly. You push it to the server running Ubuntu. It crashes. Your teammate pulls it on Windows. Different crash. This is the classic environment mismatch problem — different OS versions, different library versions, different everything.</p>

<p>Docker solves this by packaging your app <em>along with everything it needs to run</em> into a single unit called a <strong>container</strong>. The container runs identically everywhere Docker is installed.</p>

<blockquote>"A container is like a shipping container for software. The contents are isolated from the outside world, and it runs the same whether it's on a cargo ship, a truck, or a warehouse."</blockquote>

<h2>Containers vs Virtual Machines</h2>
<p>You might be thinking: "Isn't that just a virtual machine?" Not quite. VMs virtualize the entire hardware stack — they're heavy (GBs) and slow to start (minutes). Containers share the host OS kernel — they're lightweight (MBs) and start in seconds.</p>

<ul>
  <li><strong>VM</strong>: Full OS + your app. Like renting an entire apartment.</li>
  <li><strong>Container</strong>: Just your app + its dependencies. Like renting a furnished room.</li>
</ul>

<h2>Key Concepts</h2>
<p><strong>Image</strong> — a read-only blueprint for a container. Think of it as a recipe. You build an image once and run it anywhere.</p>
<p><strong>Container</strong> — a running instance of an image. You can run many containers from the same image simultaneously.</p>
<p><strong>Dockerfile</strong> — a text file with instructions for building an image. It's your recipe card.</p>
<p><strong>Docker Hub</strong> — a public registry of pre-built images. Like npm, but for containers.</p>

<h2>Your First Dockerfile</h2>
<p>Let's containerize a simple Node.js app:</p>

<pre><code class="language-dockerfile"># Start from an official Node.js image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your source code
COPY . .

# Tell Docker which port your app listens on
EXPOSE 3000

# The command to run when the container starts
CMD ["node", "server.js"]</code></pre>

<h2>Building and Running</h2>
<pre><code class="language-bash"># Build the image (tag it with a name)
docker build -t my-node-app .

# Run a container from the image
docker run -p 3000:3000 my-node-app

# Run in the background (detached mode)
docker run -d -p 3000:3000 my-node-app

# List running containers
docker ps

# Stop a container
docker stop &lt;container-id&gt;</code></pre>

<h2>Docker Compose: Multiple Services</h2>
<p>Real apps have multiple services — a web server, a database, a cache. Docker Compose lets you define and run them all together with a single file:</p>

<pre><code class="language-yaml"># docker-compose.yml
version: "3.9"
services:
  web:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - db
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/mydb

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:</code></pre>

<pre><code class="language-bash"># Start everything
docker compose up

# Start in background
docker compose up -d

# Tear everything down
docker compose down</code></pre>

<h2>Useful Day-to-Day Commands</h2>
<pre><code class="language-bash"># Shell into a running container (for debugging)
docker exec -it &lt;container-id&gt; sh

# View container logs
docker logs &lt;container-id&gt; -f

# Remove all stopped containers and unused images
docker system prune</code></pre>

<h2>The Takeaway</h2>
<p>Docker is one of those tools that feels like overkill until the first time it saves you from a 3-hour "why doesn't this work on the server" debugging session. Learn the basics, Dockerize one project, and you'll never go back.</p>
    `,
  },
  {
    id: "4",
    title: "REST APIs Explained: The Language of the Web",
    subtitle: "How apps talk to each other — and how to build your first API.",
    slug: "rest-apis-explained",
    date: "2024-09-12",
    author: "Anuj Chauhan",
    tags: ["API", "REST", "Backend", "Beginner"],
    coverImage: "/rest-cover.png",
    excerpt: "Every time you open Instagram, your phone talks to a server using an API. REST is the most common way that conversation happens. Here's how it works — and how to build one.",
    content: `
<h2>What Is an API?</h2>
<p>API stands for <strong>Application Programming Interface</strong>. It's a contract between two pieces of software: "if you send me a request in this format, I'll send back a response in that format."</p>

<p>When you open a weather app, it doesn't store weather data itself — it asks a weather API. When you log in with Google, your app talks to Google's API. APIs are everywhere.</p>

<h2>What Makes an API "RESTful"?</h2>
<p>REST (Representational State Transfer) is a set of conventions for designing APIs over HTTP. A REST API uses:</p>

<ul>
  <li><strong>URLs to identify resources</strong> — <code>/users</code>, <code>/articles/42</code>, <code>/orders</code></li>
  <li><strong>HTTP methods to describe actions</strong> — GET, POST, PUT, DELETE</li>
  <li><strong>JSON for data</strong> — the universal language of web APIs</li>
</ul>

<h2>The HTTP Methods You Need to Know</h2>
<p>Think of these like CRUD operations:</p>

<ul>
  <li><code>GET /articles</code> — <strong>Read</strong> all articles</li>
  <li><code>GET /articles/1</code> — <strong>Read</strong> article with id 1</li>
  <li><code>POST /articles</code> — <strong>Create</strong> a new article (send data in the body)</li>
  <li><code>PUT /articles/1</code> — <strong>Update</strong> article 1 (replace entirely)</li>
  <li><code>PATCH /articles/1</code> — <strong>Update</strong> article 1 (partial update)</li>
  <li><code>DELETE /articles/1</code> — <strong>Delete</strong> article 1</li>
</ul>

<h2>HTTP Status Codes</h2>
<p>The server always responds with a status code telling you what happened:</p>

<ul>
  <li><strong>2xx — Success</strong>: <code>200 OK</code>, <code>201 Created</code>, <code>204 No Content</code></li>
  <li><strong>4xx — Client Error</strong>: <code>400 Bad Request</code>, <code>401 Unauthorized</code>, <code>404 Not Found</code></li>
  <li><strong>5xx — Server Error</strong>: <code>500 Internal Server Error</code></li>
</ul>

<h2>Building a REST API with Node.js + Express</h2>
<pre><code class="language-javascript">const express = require("express");
const app = express();
app.use(express.json());

// In-memory "database"
let articles = [
  { id: 1, title: "Git for Beginners", author: "Anuj" },
  { id: 2, title: "Docker Explained", author: "Anuj" },
];

// GET all articles
app.get("/articles", (req, res) => {
  res.json(articles);
});

// GET one article
app.get("/articles/:id", (req, res) => {
  const article = articles.find(a => a.id === Number(req.params.id));
  if (!article) return res.status(404).json({ error: "Not found" });
  res.json(article);
});

// POST create article
app.post("/articles", (req, res) => {
  const newArticle = { id: Date.now(), ...req.body };
  articles.push(newArticle);
  res.status(201).json(newArticle);
});

// DELETE article
app.delete("/articles/:id", (req, res) => {
  articles = articles.filter(a => a.id !== Number(req.params.id));
  res.status(204).send();
});

app.listen(3000, () => console.log("API running on port 3000"));</code></pre>

<h2>Testing Your API</h2>
<p>Use <strong>curl</strong> from the terminal or install <strong>Postman</strong> / <strong>Insomnia</strong> for a GUI:</p>

<pre><code class="language-bash"># Get all articles
curl http://localhost:3000/articles

# Create a new article
curl -X POST http://localhost:3000/articles \\
  -H "Content-Type: application/json" \\
  -d '{"title": "REST APIs", "author": "Anuj"}'

# Delete article with id 1
curl -X DELETE http://localhost:3000/articles/1</code></pre>

<h2>Best Practices</h2>
<ul>
  <li>Use nouns for URLs, not verbs — <code>/articles</code> not <code>/getArticles</code></li>
  <li>Always return meaningful status codes</li>
  <li>Version your API — <code>/api/v1/articles</code></li>
  <li>Validate input and return clear error messages</li>
  <li>Use HTTPS in production — always</li>
</ul>

<h2>The Takeaway</h2>
<p>REST APIs are the backbone of modern web development. Once you understand the pattern — resources + HTTP methods + JSON — you can consume any API and build your own. It's one of the highest-leverage skills you can learn as a backend developer.</p>
    `,
  },
  {
    id: "5",
    title: "Async/Await in JavaScript: Taming the Callback Beast",
    subtitle: "Write asynchronous code that actually looks like it makes sense.",
    slug: "async-await-javascript",
    date: "2024-11-20",
    author: "Anuj Chauhan",
    tags: ["JavaScript", "Async", "Beginner"],
    coverImage: "/async-cover.png",
    excerpt: "Callback hell, promise chains, async/await — JavaScript's async story has evolved a lot. Here's the full picture, explained clearly, so you can write clean async code with confidence.",
    content: `
<h2>Why Is JavaScript Async in the First Place?</h2>
<p>JavaScript runs in a single thread — it can only do one thing at a time. But web apps constantly need to wait: for a network request, a database query, a file read. If JavaScript blocked while waiting, your entire UI would freeze.</p>

<p>The solution: <strong>asynchronous programming</strong>. Instead of waiting, JavaScript says "go do this, and call me back when you're done" — and moves on to other work in the meantime.</p>

<h2>The Evolution: Callbacks → Promises → Async/Await</h2>

<h3>1. Callbacks (the old way)</h3>
<pre><code class="language-javascript">// Nested callbacks = "callback hell"
fetchUser(userId, function(user) {
  fetchPosts(user.id, function(posts) {
    fetchComments(posts[0].id, function(comments) {
      // We're three levels deep and it only gets worse
      console.log(comments);
    });
  });
});</code></pre>

<p>This works, but it's hard to read, hard to debug, and error handling is a nightmare.</p>

<h3>2. Promises (better)</h3>
<pre><code class="language-javascript">fetchUser(userId)
  .then(user => fetchPosts(user.id))
  .then(posts => fetchComments(posts[0].id))
  .then(comments => console.log(comments))
  .catch(err => console.error("Something went wrong:", err));</code></pre>

<p>Much cleaner. But chaining <code>.then()</code> calls still feels awkward, especially when you need variables from earlier steps.</p>

<h3>3. Async/Await (the modern way)</h3>
<pre><code class="language-javascript">async function loadData(userId) {
  try {
    const user = await fetchUser(userId);
    const posts = await fetchPosts(user.id);
    const comments = await fetchComments(posts[0].id);
    console.log(comments);
  } catch (err) {
    console.error("Something went wrong:", err);
  }
}</code></pre>

<p>This reads like synchronous code. It's the same async operations under the hood — just much easier to reason about.</p>

<h2>The Rules of Async/Await</h2>
<ul>
  <li><code>async</code> before a function makes it return a Promise automatically</li>
  <li><code>await</code> can only be used inside an <code>async</code> function</li>
  <li><code>await</code> pauses execution of that function until the Promise resolves</li>
  <li>Always wrap <code>await</code> calls in <code>try/catch</code> for error handling</li>
</ul>

<h2>Fetching Data from an API</h2>
<pre><code class="language-javascript">async function getGitHubUser(username) {
  try {
    const response = await fetch(\`https://api.github.com/users/\${username}\`);

    if (!response.ok) {
      throw new Error(\`HTTP error: \${response.status}\`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error("Failed to fetch user:", err);
    return null;
  }
}

// Usage
const user = await getGitHubUser("torvalds");
console.log(user.name); // "Linus Torvalds"</code></pre>

<h2>Running Things in Parallel</h2>
<p>A common mistake: awaiting things one by one when they don't depend on each other.</p>

<pre><code class="language-javascript">// SLOW — waits for each one before starting the next
const user = await fetchUser(1);      // 200ms
const posts = await fetchPosts(1);    // 200ms
const tags = await fetchTags();       // 200ms
// Total: ~600ms

// FAST — all three start at the same time
const [user, posts, tags] = await Promise.all([
  fetchUser(1),
  fetchPosts(1),
  fetchTags(),
]);
// Total: ~200ms (the slowest one)</code></pre>

<p>Use <code>Promise.all()</code> whenever your async operations are independent. It's one of the easiest performance wins in JavaScript.</p>

<h2>Async in React</h2>
<pre><code class="language-javascript">import { useState, useEffect } from "react";

function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(\`/api/users/\${userId}\`);
        const data = await res.json();
        setUser(data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  if (loading) return &lt;p&gt;Loading...&lt;/p&gt;;
  return &lt;h1&gt;{user.name}&lt;/h1&gt;;
}</code></pre>

<h2>The Takeaway</h2>
<p>Async/await didn't change how JavaScript works under the hood — Promises are still there. It just gave us a way to write async code that looks and reads like normal code. Master this pattern and a huge chunk of JavaScript development becomes dramatically simpler.</p>
    `,
  },
];
