# Make It So

Make It So is a sample Todo app powered by Gemini AI, Firebase auth and firestore.

## Introduction

[Read more about Firebase](https://firebase.google.com/docs)
[Read more about Gemini](https://ai.google.dev/gemini-api/docs/quickstart?lang=node)

## Setup and run in IDX

TODO

## Setup and run locally

### Prerequisites

- Node.js version 20+
- npm version 10+
- Angular CLI 18+

### Setup Instructions

1. **Firebase setup:**

   - Create your project on the [Firebase Console](https://console.firebase.google.com).
   - Enable Firestore and anonymous authentication in the Firebase console.
   - Copy your Firebase config object ("Add Firebase to your web app"), and paste it into the `src/environments.ts` file.

1. **Gemini setup:**

   - Generate your Gemini API keys from [Google AI Gemini](https://ai.google.dev/gemini-api/docs/quickstart?lang=node).
   - Add your API keys to the `src/environments.ts` file.

1. **Install dependencies:**
   - Run `npm install` to install the app's dependencies.

### Running the App Locally

1. **Serve the App:**

   - Run `ng serve` to start the Angular development server.
   - Open your browser and navigate to `http://localhost:4200`.

1. **Create a task:**

   - Select the "generate task" on the left to initiate the creation of a new task.
   - Gemini is used to suggest a task title, edit the title as you see fit.

1. **Generate subtasks:**

   - Based on your title and/or an uploaded image you can generate subtasks using Gemini AI.

1. **Save the task:**
   - Save to add the task to your dashboard.

## Deploying the App

This app has been created to help you quickly experiment with Firebase and the Gemini API. You are using your own project to experiment and see how Gemini works.

Caution: this app uses Google AI SDK which exposes your API key. To somewhat protect your API key, you should impose a quota limit to protect the project. If you are using the IDX setup, it's already applied.

For production or enterprise-scale mobile or web apps that directly call the Gemini API, Firebase storngly recommends migrating to [Vertex AI in Firebase](https://firebase.google.com/docs/vertex-ai/migrate-to-vertex-ai?platform=flutter#vertex-ai-for-firebase_1)
and turn on [Firebase App Check](https://firebase.google.com/docs/vertex-ai/app-check) protection.

Migrating this app to Vertex AI in Firebase with Firebase App Check protection is straightforward and the code is commented into the app for you already. The Firebase Console walks you through enabling Vertex AI in Firebase and Firebase App Check. Alternatively, a sample Terraform config [prod.tf.example](prod.tf.example) is provided to set up those services at scale.

## Technology

- **Angular**
- **Firebase**:
  - **Auth**
  - **Firestore**
- **Gemini**:
  - **Google AI**
  - **Vertex AI**

## Docs

- [Firebase Support](https://firebase.google.com/support)
- [Gemini AI Documentation](https://ai.google.dev/gemini-api/docs/quickstart?lang=node)
