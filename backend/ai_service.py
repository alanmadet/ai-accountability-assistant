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

                Extract ONLY meaningful, actionable, or important
                items from emails. Ignore generic system notifications
                with no action required.

                Return ONLY valid JSON as a list.

                Valid categories:

                follow_ups_needed:
                - User needs to reply or respond to someone
                - User owes an action or follow-up
                - User made a commitment or was directly asked to act
                - Pending action items from ongoing threads

                potential_commitments:
                - User may have agreed to something implicitly
                - RSVPs or invitations requiring a decision
                - Requests for the user's time or involvement
                - Items user has been looped into that may need acknowledgment

                renewals_deadlines:
                - Subscriptions renewing or about to expire
                - Passwords, memberships, or passes expiring
                - Deadlines approaching for any task or opportunity
                - Payments due or overdue
                - Warranties or contracts ending soon

                high_volume_senders:
                - Mass marketing or promotional newsletters
                - Emails from brands sending very frequently
                - Subscription list emails worth unsubscribing from
                - Bulk automated emails with no specific action required

                travel_events:
                - Flight, hotel, or rental car bookings and confirmations
                - Event invites, tickets, or registrations
                - Travel itineraries or upcoming trip details
                - Calendar-worthy appointments or plans

                financial_items:
                - Bank or credit card statements and alerts
                - Payment confirmations, receipts, or invoices
                - Billing notifications
                - Investment or account balance updates
                - Reimbursements, refunds, or cashback

                personal_admin:
                - Appointment confirmations (medical, dental, etc.)
                - Package deliveries or shipping tracking
                - Account setup or verification tasks
                - Forms, registrations, or paperwork to complete
                - Personal logistics and coordination

                opportunities:
                - Meaningful deals or sales with real savings
                - Limited-time offers worth acting on
                - Financial rewards, referral bonuses, or loyalty perks
                - Job, career, or business opportunities
                - Exclusive access or early-bird offers

                Priority levels:
                - low
                - medium
                - high

                Examples:

                Email: "Can you send the updated proposal by Friday?"
                Result:
                [{"title": "Send updated proposal by Friday",
                  "status": "open", "category": "follow_ups_needed",
                  "priority": "high"}]

                Email: "Your Amex transfer bonus expires tonight."
                Result:
                [{"title": "Act on Amex transfer bonus before expiry",
                  "status": "open", "category": "renewals_deadlines",
                  "priority": "high"}]

                Email: "PlayStation spring sale ends tomorrow."
                Result:
                [{"title": "Review PlayStation spring sale",
                  "status": "open", "category": "opportunities",
                  "priority": "medium"}]

                Email: "Your flight to NYC on June 25 is confirmed."
                Result:
                [{"title": "NYC flight confirmed - June 25",
                  "status": "open", "category": "travel_events",
                  "priority": "medium"}]

                Email: "Your Discover statement is ready."
                Result:
                [{"title": "Review Discover statement",
                  "status": "open", "category": "financial_items",
                  "priority": "low"}]

                Return format:
                [
                  {
                    "title": "...",
                    "status": "open",
                    "category": "follow_ups_needed",
                    "priority": "medium"
                  }
                ]

                If no actionable items exist, return [].
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
