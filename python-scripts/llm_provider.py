from abc import ABC, abstractmethod
from typing import List, Dict, Any
import google.generativeai as genai
from config import GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY


class LLMProvider(ABC):
    @abstractmethod
    def generate(self, prompt: str, context: str) -> str:
        pass

    @abstractmethod
    def generate_with_history(self, messages: List[Dict[str, str]]) -> str:
        pass


class GeminiProvider(LLMProvider):
    def __init__(self, model_name: str = "gemini-pro"):
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not found in environment")
        genai.configure(api_key=GEMINI_API_KEY)
        self.model = genai.GenerativeModel(model_name)

    def generate(self, prompt: str, context: str) -> str:
        full_prompt = f"""Based on the following research papers context, answer the question.

Context:
{context}

Question: {prompt}

Provide a comprehensive answer citing relevant papers from the context."""

        response = self.model.generate_content(full_prompt)
        return response.text

    def generate_with_history(self, messages: List[Dict[str, str]]) -> str:
        chat = self.model.start_chat(history=[])
        for msg in messages[:-1]:
            if msg["role"] == "user":
                chat.send_message(msg["content"])

        response = chat.send_message(messages[-1]["content"])
        return response.text


class OpenAIProvider(LLMProvider):
    def __init__(self, model_name: str = "gpt-4"):
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not found in environment")
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=OPENAI_API_KEY)
            self.model_name = model_name
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai")

    def generate(self, prompt: str, context: str) -> str:
        messages = [
            {"role": "system", "content": "You are a helpful research assistant that answers questions based on provided research papers."},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {prompt}"}
        ]

        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages
        )
        return response.choices[0].message.content

    def generate_with_history(self, messages: List[Dict[str, str]]) -> str:
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages
        )
        return response.choices[0].message.content


class AnthropicProvider(LLMProvider):
    def __init__(self, model_name: str = "claude-3-sonnet-20240229"):
        if not ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY not found in environment")
        try:
            from anthropic import Anthropic
            self.client = Anthropic(api_key=ANTHROPIC_API_KEY)
            self.model_name = model_name
        except ImportError:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")

    def generate(self, prompt: str, context: str) -> str:
        message = self.client.messages.create(
            model=self.model_name,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": f"Context:\n{context}\n\nQuestion: {prompt}\n\nProvide a comprehensive answer based on the context."
                }
            ]
        )
        return message.content[0].text

    def generate_with_history(self, messages: List[Dict[str, str]]) -> str:
        message = self.client.messages.create(
            model=self.model_name,
            max_tokens=1024,
            messages=messages
        )
        return message.content[0].text


class LLMFactory:
    @staticmethod
    def create_provider(provider_name: str = "gemini", **kwargs) -> LLMProvider:
        providers = {
            "gemini": GeminiProvider,
            "openai": OpenAIProvider,
            "anthropic": AnthropicProvider,
        }

        provider_class = providers.get(provider_name.lower())
        if not provider_class:
            raise ValueError(f"Unknown provider: {provider_name}. Available: {list(providers.keys())}")

        return provider_class(**kwargs)