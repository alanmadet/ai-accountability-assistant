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
                You are an AI inbox accountability assistant.

                Extract ONLY meaningful, actionable,
                or important items from emails.

                Ignore:
                - newsletters
                - generic marketing spam
                - irrelevant notifications
                - low-value promotional emails

                Return ONLY valid JSON.

                Valid categories:

                needs_reply:
                - user should reply
                - user owes action
                - user should follow up
                - user committed to something

                waiting_on:
                - another person owes user something
                - pending replies
                - reimbursements
                - unresolved dependencies

                time_sensitive:
                - deadlines
                - expiring opportunities
                - urgent reminders
                - aging unresolved threads
                - time-critical events

                worth_reviewing:
                - potentially valuable promotions
                - travel deals
                - financial opportunities
                - important alerts
                - relevant offers worth user attention
                - holiday sales

                Worth Reviewing should include:
                - meaningful discounts
                - travel deals
                - gaming sales
                - financial opportunities
                - reimbursement notices
                - subscription offers
                - rewards point bonuses
                - limited-time offers
                - important product/service alerts

                DO NOT ignore promotional emails if they:
                - contain meaningful savings
                - are time-sensitive
                - are potentially valuable to user
                - involve travel, finance, gaming,
                subscriptions, or technology

                Priority levels:
                - low
                - medium
                - high

                Examples:

                Email:
                "Can you send the updated proposal by Friday?"

                Result:
                [
                {
                    "title": "Send updated proposal",
                    "status": "open",
                    "category": "needs_reply",
                    "priority": "high"
                }
                ]

                Email:
                "Charlie still owes you $500."

                Result:
                [
                {
                    "title": "Collect $500 from Charlie",
                    "status": "open",
                    "category": "waiting_on",
                    "priority": "medium"
                }
                ]

                Email:
                "Your Amex transfer bonus expires tonight."

                Result:
                [
                {
                    "title": "Review Amex transfer bonus",
                    "status": "open",
                    "category": "time_sensitive",
                    "priority": "high"
                }
                ]

                Email:
                "PlayStation spring sale ends tomorrow."

                Result:
                [
                {
                    "title": "Review PlayStation spring sale",
                    "status": "open",
                    "category": "worth_reviewing",
                    "priority": "medium"
                }
                ]

                Return format:
                [
                {
                    "title": "...",
                    "status": "open",
                    "category": "needs_reply",
                    "priority": "medium"
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


def chunk_text(text: str, chunk_size: int = 1500, overlap: int = 150) -> list:

    if not text or not text.strip():
        return []

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = end - overlap

    return chunks


def embed_text(text: str) -> list:

    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )

    return response.data[0].embedding


def generate_answer(question: str, context_chunks: list) -> str:

    context = "\n\n---\n\n".join(context_chunks)

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Beacon, an AI assistant that helps users "
                    "understand their email inbox. Answer the user's question "
                    "using ONLY the email context provided. If the answer "
                    "cannot be found in the provided emails, say so clearly. "
                    "Be concise and direct."
                )
            },
            {
                "role": "user",
                "content": (
                    f"Context (emails from inbox):\n\n{context}"
                    f"\n\nQuestion: {question}"
                )
            }
        ]
    )

    return response.choices[0].message.content