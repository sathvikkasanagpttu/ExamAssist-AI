-- Migration 002: Academic Knowledge Graph & Prerequisites
-- Stores concepts, prerequisite relationships, formulas, and pitfalls

CREATE TABLE IF NOT EXISTS kg_concepts (
  id text PRIMARY KEY,
  name text NOT NULL,
  domain text NOT NULL,
  definition text NOT NULL,
  complexity text DEFAULT 'Introductory',
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kg_prerequisites (
  concept_id text NOT NULL REFERENCES kg_concepts(id) ON DELETE CASCADE,
  prerequisite_id text NOT NULL REFERENCES kg_concepts(id) ON DELETE CASCADE,
  weight numeric(3,2) DEFAULT 1.0,
  PRIMARY KEY (concept_id, prerequisite_id),
  CHECK (concept_id <> prerequisite_id)
);

CREATE TABLE IF NOT EXISTS kg_formulas (
  id text PRIMARY KEY,
  name text NOT NULL,
  expression text NOT NULL,
  variables text[] DEFAULT '{}',
  assumptions text DEFAULT '',
  domain text DEFAULT ''
);

CREATE TABLE IF NOT EXISTS kg_concept_formulas (
  concept_id text NOT NULL REFERENCES kg_concepts(id) ON DELETE CASCADE,
  formula_id text NOT NULL REFERENCES kg_formulas(id) ON DELETE CASCADE,
  PRIMARY KEY (concept_id, formula_id)
);

CREATE TABLE IF NOT EXISTS kg_pitfalls (
  id text PRIMARY KEY,
  concept_id text NOT NULL REFERENCES kg_concepts(id) ON DELETE CASCADE,
  misconception text NOT NULL,
  correction text NOT NULL
);

CREATE INDEX IF NOT EXISTS kg_concepts_domain_idx ON kg_concepts (domain);
CREATE INDEX IF NOT EXISTS kg_prerequisites_prereq_idx ON kg_prerequisites (prerequisite_id);
