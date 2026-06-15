# setup.py
import openai
import psycopg2
from psycopg2.extras import execute_batch

client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def embed_all_tools():
    conn = psycopg2.connect("your-db")
    cursor = conn.cursor()
    
    # Get all tools with categories
    cursor.execute("""
        SELECT t.id, t.name, COALESCE(t.description, ''),
               STRING_AGG(c.name, ', ') as categories
        FROM tools t
        LEFT JOIN tool_categories tc ON tc.tool_id = t.id
        LEFT JOIN categories c ON c.id = tc.category_id
        GROUP BY t.id, t.name, t.description
    """)
    
    tools = cursor.fetchall()
    
    # Prepare texts (batch for efficiency)
    texts = [
        f"{name}. {desc}. Categories: {cats or 'General'}"
        for _, name, desc, cats in tools
    ]
    
    # OpenAI supports batching up to 2048 texts!
    response = client.embeddings.create(
        input=texts,
        model="text-embedding-3-small"
    )
    
    # Update database
    updates = [
        (emb.embedding, tools[i][0]) 
        for i, emb in enumerate(response.data)
    ]
    
    execute_batch(
        cursor,
        "UPDATE tools SET embedding = %s::vector(1536) WHERE id = %s",
        updates,
        page_size=100
    )
    
    conn.commit()
    print(f"Embedded {len(tools)} tools!")

# Run once
embed_all_tools()

