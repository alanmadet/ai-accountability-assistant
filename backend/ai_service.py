import os
import json

from dotenv import load_dotenv

from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

def extract_tasks(email):

    print("EMAIL SENT TO LLM:")
    print(email)

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "system",
                "content": """
You extract actionable tasks from emails. If I need to do something put it on the I owe category, if someone owes me something or I'm waiting on something then put it on the waiting on section

Return ONLY valid JSON.

Format:
[
  {
    "title": "...",
    "status": "...",
    "category": "you_owe",
    "priority": "high"
  }
]
"""
            },
            {
                "role": "user",
                "content": email
            }
        ]
    )

    raw = response.choices[0].message.content

    print("RAW LLM RESPONSE:")
    print(raw)

    if not raw:
        print("EMPTY LLM RESPONSE")
        return []

    try:
        parsed = json.loads(raw)

        if not isinstance(parsed, list):
            return []

        return parsed

    except Exception as e:

        print("JSON PARSE ERROR")
        print(e)

        return []