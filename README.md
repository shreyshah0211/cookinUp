# cookinUp

DubHacks 2026

## Inspiration

With agentic AI becoming more popular, we wanted to create a project that allows users who are new to multi-agent development to not only learn how to implement this system in an easy way, but to also better understand how their workflow operates. While working on previous agentic projects, we kept running into the same problem: once you have a few agents talking to each other, you have no idea what's going on inside. Which agent is working on a certain task? Where did all the tokens go? We couldn't answer those questions without searching through logs. Therefore, we created a product that utilizes token optimization where the user can click on an agent to assign them a task that we want prioritized. Furthermore, we added a learning component that gives users or students who are new to agentic AI development the chance to become better at prompting and how to overall become a better developer.

## What it does

cookinUp turns a request sent to an AI model into a visual, kitchen-styled system.

- **Ordering:** you type in an order, and a Head Chef breaks it into smaller tasks and writes up a menu.
- **The menu:** each task gets its own station with a goal, a model, a token budget, and a set of tools. You can look over the menu and change it before any of the agent chefs start cooking.
- **Cooking:** a team of chef agents "cooks" by handling those tasks at the same time, and an expediter puts everything together into one final output.
- **The kitchen setup:** each agent is a chef at its own station, each job is a ticket that moves through the kitchen, and tokens are the ingredients.
- **Chefs work together:** you watch all of it happen live, and the chefs don't just work alone. They can ask each other questions and pass notes along directly, so not everything has to go back through the Head Chef. You see each conversation as a speech bubble with a line connecting the two chefs.
- **You can step in:** at any point, leave a chef a note to change what it does, switch it to a different model, move tokens from one station to another, or stop it in the middle of a run. If you rerun a station, it and everything that depends on it gets cooked again so that the final answer always matches your changes.
- **Cost tracking:** every chef has a live token and cost counter, and when the order is done you get a receipt that shows what it all cost.
- **Models and keys:** cookinUp works with Claude, OpenAI and Gemini. The Head Chef picks a model for each station based on how hard the job is, and you can change any of those picks.
- **Built for learning:** cookinUp explains every step in plain words as it happens.
- **Prompt Power meter:** it grades your order while you type on four things: what you asked for, how much detail you gave, what shape you want the answer in, and who it's for. It then suggests one thing to add next.
- **Note helper:** it teaches you to give specific feedback like "make it shorter and add a joke" instead of just "redo it."
- **Progress:** as your prompts get better, you unlock lessons and move up through the ranks from Dishwasher to Head Chef. There are also five challenges in the Recipe Book that earn you badges along the way.

## How we built it

cookinUp is built with Next.js, React, and TypeScript, using the Vercel AI SDK for structured outputs and tool loops. Each order runs in its own kitchen service on the server: a planner returns the menu, a scheduler starts every station whose dependencies are done, and the expediter merges the results into one answer and flags conflicts between stations. Every state change streams to the browser over Server-Sent Events, and the canvas kitchen re-renders from that state.

The kitchen itself is a custom pixel-art canvas engine with sprite rendering, pathfinding, and a task queue per chef, with draggable in-game windows layered on top. Stations can run a short research step first, using the provider's web search or by asking a colleague.

The tracks plug in like this:

- **Backboard:** After each order, save a short note about that student's prompting, like "usually forgets to say who it's for." Before their next order, pull those notes back and use them for a personalized tip ("last time you left out the audience, want to add it?"). Their progress follows them across devices, since it no longer lives only in one browser.
- **Gemini API:** Used this to implement the Gemini model into our system alongside the Claude and OpenAI models to handle tasks and input.
- **VEYZL:** we ran audits on our repo and used the findings to tighten things up, especially around chefs with tools, web search, untrusted messages passing between chefs, and API keys in request headers.
- **DEV Writing Challenge:** we'll publish a write-up of what we built and what we learned.

## Challenges we ran into

- Seeing inside the system without overwhelming users.
- Showing every message, tool call, and rerun in a way a beginner can follow took a lot of iteration.
- Keeping reruns correct. When one chef's work changes, everything built on it has to be invalidated and re-cooked.
- Structured output sometimes came back cut off or invalid, so we added retries that recovered without breaking a running order.
- Chefs can overrun their token budgets, which makes costs harder to predict and control.
- Wanted to figure out ways we could make this product engaging to help users learn about agentic AI development.

## Accomplishments that we're proud of

We are proud of the fact that we were able to create a product that can be very beneficial to new users and young students who want to learn more about AI and how to utilize agentic AI workflows, especially since this is becoming the new wave of software development. We were able to take a messy agent pipeline and make it something you can read and understand in a few seconds. Additionally, we were able to effectively implement APIs from the side track organizations.

## What we learned

Once you can see what each agent costs, deciding where to spend gets a lot easier. Before we had live counters, a long run felt expensive without telling us why. Seeing the cost next to each chef showed us which stations were working harder than their results justified, and that made it simple to move tokens around or switch a station to a cheaper model.

We also learned that plain words explain more than a diagram does. Beginners could follow what was happening once every step was described simply as it happened. Building those explanations from run data, instead of asking a model to write them, meant that helping people understand never added to their bill. Letting chefs talk to each other directly changed how we thought about structure. Sending everything through the Head Chef was easy to follow but slow, while direct conversations moved faster and were harder to keep under control. Showing every exchange on screen turned out to matter more than the speed, because people could only trust what they could see.

Reruns taught us to think about dependencies. If one station's work changes, everything built on top of it is out of date, so a rerun has to cook that station again along with everything after it. Without that, the final answer wouldn't match what the user had just changed.

Finally, we learned that feedback has to be specific to teach anything. "Make it shorter and add a joke" shows a student what a good instruction looks like, and "redo it" doesn't, so we built the note helper and the Prompt Power meter around that idea.

## What's next for cookinUp

- Saving orders on the server so they survive a restart (today only browser snapshots persist).
- Hard budget limits so chefs can't overrun their allowance.
- Comparing direct chef-to-chef messaging with routing everything through the Head Chef, measured on tokens, time, and quality.
- More model providers and better cost reporting.
- Importing an existing agent setup so teams can map the systems they already run.
- Replaying past orders step by step to find where a run went wrong.
- Being able to zoom in on an agent so that you can see specifically what they are working on and what tasks they are handling. We can visualize this too by showing the ingredients they are working with.
- Add a deep/advanced learning mode with a full explanation of the LLM architecture and how to implement and build this.

## Running it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Open the app, click **Keys**, and paste an Anthropic, OpenAI and/or Gemini API key (per-use API keys; ChatGPT Plus, Claude Pro or Gemini app subscriptions don't work). Keys stay in your browser's local storage, travel in request headers with each order, and are held in server memory only for that order, never logged or stored.

Optional server settings in `.env.local` (git-ignored):

```bash
BACKBOARD_API_KEY=...              # long-term memory between orders (Backboard)
ANTHROPIC_API_KEY=...              # "house" keys: let visitors without keys cook on yours
OPENAI_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
HOUSE_BUDGET_USD=5                 # daily cap on what visitors can spend on house keys
```

Cook from the terminal, no UI:

```bash
npm run cook -- "Build a landing page for a bakery"
```
