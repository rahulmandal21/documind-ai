---
sdk: docker
---
# 🚀 DocuMind AI

An intelligent AI-powered document assistant that lets users upload files and interact with them through natural language.

## ✨ Features

- 📄 Upload PDFs, Images, and DOCX files
- 🤖 Ask questions from your documents
- 🧠 AI-generated Summaries, Study Notes, MCQs, Quizzes, Fill in the blanks, True/False questions
- 🎤 Voice input support
- 📊 Confidence score for every answer
- 📌 Source highlighting with page numbers
- 🧑‍🏫 AI Tutor Mode

## 🏗️ Tech Stack

- **Frontend:** React (Next.js), TypeScript
- **Backend:** FastAPI, LangChain, FAISS, HuggingFace Embeddings, Groq (LLaMA 3)

## ⚙️ Setup

1. Clone the repo
2. Add `GROQ_API_KEY` in backend `.env`
3. Run backend: `uvicorn main:app --reload`
4. Run frontend: `npm run dev`

## 💡 Author
Rahul Mandal