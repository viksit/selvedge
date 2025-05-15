// examples/article-generator.ts
// Example: Generate a markdown article from topic using outline + drafting

s.debug('*');
import { selvedge as s } from '../src';

s.models({
  gpt4: s.openai('gpt-4')
});

/* ── Prompt 1: generate article outline ─────────────────────────── */

const outlineTopic = s.ChainOfThought`
  Provide a detailed article outline for: ${ topic => topic }
`
  .inputs({
    topic: s.schema.string()
  })
  .outputs({
    title:   s.schema.string(),
    sections: s.schema.array(s.schema.string()),
    section_subheadings: s.schema.record(
      s.schema.string(),
      s.schema.array(s.schema.string())
    )
  })
  .using('gpt4');

/* ── Prompt 2: draft each section ───────────────────────────────── */

const draftSection = s.ChainOfThought`
  ## ${ h => h }

  ${ sh => (Array.isArray(sh) && sh.length)
      ? sh.map(sub => `### ${sub}`).join('\n')
      : '' }

  Write 150–200 words for the section above about **${ t => t }**.
`
  .inputs({
    t:  s.schema.string(),              // original topic
    h:  s.schema.string(),              // section heading
    sh: s.schema.array(s.schema.string())
  })
  .outputs({
    content: s.schema.string()
  })
  .using('gpt4');

/* ── Compose into article generator ─────────────────────────────── */

const generateArticle = async (topic: string) => {
  const { title, sections, section_subheadings } = await outlineTopic({ topic });

  const sectionList = Array.isArray(sections) ? sections : [];
  const subsMap     = (section_subheadings ?? {}) as Record<string, any>;

  const articleSections = await Promise.all(
    sectionList.map(async heading => {
      const shArray = Array.isArray(subsMap[heading]) ? subsMap[heading] : [];
      const { content } = await draftSection({
        t: topic,                // ← pass raw topic, not title
        h: heading,
        sh: shArray
      });
      return content.trim();
    })
  );

  return { title, sections: articleSections };
};

/* ── Run ────────────────────────────────────────────────────────── */

const article = await generateArticle('World Cup 2002');
console.log(article.title);
console.log(article.sections.join('\n\n'));