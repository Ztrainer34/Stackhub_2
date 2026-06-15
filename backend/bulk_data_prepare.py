import json
import csv
import os
import uuid
import urllib.parse
from pathlib import Path
import re
from urllib.parse import quote
from sentence_transformers import SentenceTransformer

def name_to_slug(name: str) -> str:
    # Convert to lowercase
    slug = name.lower()
    
    # Replace spaces with hyphens
    slug = slug.replace(" ", "-")
    
    # Remove all characters except alphanumeric, hyphens, and underscores
    slug = re.sub(r'[^a-z0-9\-_]', '', slug)
    
    # Remove consecutive hyphens
    slug = re.sub(r'-+', '-', slug)
    
    # Strip hyphens from start and end
    slug = slug.strip('-')
    
    return slug

def unmangle_linkedin_url(url: str):
    if not url:
        return None
    query = urllib.parse.urlparse(url).query
    params = urllib.parse.parse_qs(query)
    return urllib.parse.unquote(params["secure[url]"][0])

def normalize_name(name: str):
    return name.strip().lower() if name else ""

def vector_to_string(vec) -> str:
    """Format vector for PostgreSQL: [1.23,4.56,7.89]"""
    return "[" + ",".join(str(float(v)) for v in vec) + "]"

def generate_embeddings(texts: list[str], model_name="all-MiniLM-L6-v2"):
    print(f"Loading model: {model_name}...")
    model = SentenceTransformer(model_name)
    
    print(f"Generating embeddings for {len(texts)} texts...")
    # Batch encode for efficiency
    embeddings = model.encode(texts, batch_size=32, show_progress_bar=True)
    
    return embeddings

# Dossiers d'entrée et de sortie
input_dir = Path("data/json")
output_dir = Path("data/csv")
output_dir.mkdir(parents=True, exist_ok=True)

# Buffers de données
vendors_seen = {}
vendor_rows = []

tools_seen = {}  # key: (tool_name, vendor_name) -> tool_id
tool_rows_by_id = {}  # tool_id -> tool_row
tool_category_rows = []
categories_seen = set()
seen_tool_category_links = set()

# Parcourt tous les fichiers JSON
for file in input_dir.glob("*.json"):
    category_name = urllib.parse.unquote(file.stem.strip())

    if not category_name.endswith("_1"):
        continue

    category_name = category_name.removesuffix("_1")
    categories_seen.add(category_name)

    with open(file, encoding="utf-8") as f:
        tools = json.load(f)

    for tool in tools:
        tool_name_key = normalize_name(tool["name"])
        vendor_name_key = normalize_name(tool.get("vendor", {}).get("name"))
        dedup_key = (tool_name_key, vendor_name_key)

        if dedup_key in tools_seen:
            tool_id = tools_seen[dedup_key]
            existing = tool_rows_by_id[tool_id]
            existing["description"] = existing["description"] or tool.get("description")
            existing["logo_url"] = existing["logo_url"] or tool.get("logo")
        else:
            tool_id = str(uuid.uuid4())
            tools_seen[dedup_key] = tool_id

            # Vendor
            vendor = tool.get("vendor")
            vendor_id = None
            if vendor:
                vendor_key = normalize_name(vendor["name"])
                if vendor_key not in vendors_seen:
                    vendor_id = str(uuid.uuid4())
                    vendors_seen[vendor_key] = vendor_id
                    vendor_rows.append({
                        "id": vendor_id,
                        "name": vendor["name"],
                        "website": vendor.get("website"),
                        "x_profile": vendor.get("twitter"),
                        "linkedin_profile": unmangle_linkedin_url(vendor.get("linkedin")),
                        "head_office": vendor.get("social_siege"),
                        "year_of_foundation": vendor.get("year_of_fundation")
                    })
                else:
                    vendor_id = vendors_seen[vendor_key]

            tool_row = {
                "id": tool_id,
                "name": tool["name"],
                "description": tool.get("description"),
                "logo_url": tool.get("logo"),
                "vendor_id": vendor_id,
                "embedding": None  # Will be filled later
            }
            tool_rows_by_id[tool_id] = tool_row

        tool_category_key = (tool_id, category_name)
        if tool_category_key not in seen_tool_category_links:
            seen_tool_category_links.add(tool_category_key)
            tool_category_rows.append({
                "tool_id": tool_id,
                "category": category_name
            })

# Generate embeddings for tools
print("\n" + "="*50)
print("Generating embeddings for tools...")
print("="*50)

tool_rows = list(tool_rows_by_id.values())

if tool_rows:
    # Build a mapping of tool_id to categories
    tool_categories_map = {}
    for tc in tool_category_rows:
        tool_id = tc["tool_id"]
        category = tc["category"]
        if tool_id not in tool_categories_map:
            tool_categories_map[tool_id] = []
        tool_categories_map[tool_id].append(category)
    
    # Prepare texts for embedding
    # Format: "Tool Name. Categories: Category1, Category2. Description text."
    tool_texts = []
    tool_ids_ordered = []
    
    for tool in tool_rows:
        text_parts = []
        
        # Include name (helps with brand recognition in recommendations)
        text_parts.append(tool["name"])
        
        # Categories (heavily weighted for recommendations)
        if tool["id"] in tool_categories_map:
            categories = tool_categories_map[tool["id"]]
            # Repeat categories to emphasize them in the embedding
            text_parts.append("Categories: " + ", ".join(categories))
            text_parts.append(" ".join(categories))  # repeat for weight
        
        # Description (features and use cases)
        if tool.get("description"):
            text_parts.append(tool["description"])
        
        tool_texts.append(". ".join(text_parts))
        tool_ids_ordered.append(tool["id"])
    
    # Generate embeddings
    embeddings = generate_embeddings(tool_texts)
    
    # Add embeddings to tool_rows
    for tool, embedding in zip(tool_rows, embeddings):
        tool["embedding"] = vector_to_string(embedding)
    
    print(f"✓ Successfully generated {len(embeddings)} embeddings")

# Sauvegarde vendors.csv
if vendor_rows:
    with open(output_dir / "vendors.csv", "w", newline='', encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=vendor_rows[0].keys())
        writer.writeheader()
        writer.writerows(vendor_rows)

# Sauvegarde tools.csv
if tool_rows:
    with open(output_dir / "tools.csv", "w", newline='', encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "name", "description", "logo_url", "vendor_id", "embedding"])
        writer.writeheader()
        writer.writerows(tool_rows)

# Sauvegarde tool_categories.csv
if tool_category_rows:
    with open(output_dir / "tool_categories.csv", "w", newline='', encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["tool_id", "category"])
        writer.writeheader()
        writer.writerows(tool_category_rows)

# Sauvegarde categories.csv
if categories_seen:
    with open(output_dir / "categories.csv", "w", newline='', encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "slug"])
        for category in sorted(categories_seen):
            writer.writerow([category, name_to_slug(category)])