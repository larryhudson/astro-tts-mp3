import { getCollection } from "astro:content";
import { convertMarkdownToSpeech } from "../../../utils/text-to-speech";

export async function getStaticPaths() {
  const posts = await getCollection("blog");
  return posts.map((post) => ({
    params: { slug: post.slug },
    props: post,
  }));
}

export async function get(context) {
  console.log(context.params);

  const post = context.props;
  const markdownContent = post.body;

  return {
    body: await convertMarkdownToSpeech(markdownContent),
  };
}
