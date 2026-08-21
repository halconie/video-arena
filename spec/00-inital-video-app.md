## Building a Video Generating SaaS
You have an empty turbo repo that we want to setup for a new project that I'm building. That project is awfully close to what higgsfield does, for now let users come and generate a video based on a prompt, duration, resolution, aspect ratio, start frame, end frame and reference frames.

### Step 1
For now we want to setup all the services needed for this. The Architecture looks as follows - 
    - Frontend - A react frontend that the user will land to interact with our systems. Use bun to initialize the react project
    - Backend - A TypeScript + Express Backend which exposes the CRUD endpoints for the user
    - Postgress + Prisma - The database layer. We should write all the prisma logic in a separate package called db and re-use this package in the backend app
    - MinIO as the Object Store - For now we'd like to use minIO as the local object store
    - Self hosted Face Fusion for face swap (We will need this later not right now but let's add it to the docker compose)
    - OpenRouter as the video model routing layer. https://openrouter.ai/docs/guides/overview/multimodal/video-generation


For now, lets initialize all the packages/apps. Lets write the docker files for it. Lets also write a docker compose that lets the user start these services locally. We should also populate the steps to start the project locally the README.md file. We should update agents.md to do the same. Also add .env.examples files to all the projects 


### Step 2
Frontend - The navbar should have only one tab for now - Video. On the right side, it should have a signin/profile button. Create the login page, authentication modal, video creation page which has two tabs -
a. Text to video generation
    - User should be able to select the model, duration, resolution, aspect ratio, start frame, end frame and reference frames. Some of these would be optional. No need to show any pricing right now.
b. See your existing videos

Backend - Add support for authentication using Google and email. Add logic to talk to openrouter synchronously for now. Make sure all final videos and images (uploaded by users or fetched from openrouter) are dumped to our object store. 

Whatever env variables are needed eventually (Openrouter key/google oauth secrets) I will provide them later, for now add them to the .env.example.

By the end, also add commands in the top level package.json to start the full project locally using docker-compose.