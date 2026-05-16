import os
import json

from dotenv import load_dotenv

from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

def extract_tasks(email_text: str):

    prompt = f"""
You are an AI assistant that extracts actionable tasks
from emails.

Extract tasks from the following email.

Return ONLY valid JSON.

Schema:

[
  {{
    "title": "...",
    "status": "...",
    "category": "you_owe" or "waiting_on",
    "priority": "low" | "medium" | "high"
  }}
]

Email:

{email_text}
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0
    )

    raw = response.choices[0].message.content
    print("RAW LLM RESPONSE:")
    print(raw)

    return json.loads(raw)