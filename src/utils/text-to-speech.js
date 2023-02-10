import {
  SpeechConfig,
  SpeechSynthesisOutputFormat,
  AudioConfig,
  SpeechSynthesizer,
} from "microsoft-cognitiveservices-speech-sdk";
import { AssetCache } from "@11ty/eleventy-fetch";
import md5 from "js-md5";
import { join } from "path";
import { encode } from "html-entities";
import { markdownToTxt } from "markdown-to-txt";

function chunkText(text) {
  const MAX_CHUNK_LENGTH = 7000;

  const textLines = text.split("\n");

  let chunks = [];
  let currentChunkLines = [];

  textLines.forEach((lineText) => {
    const currentChunkLength = currentChunkLines.join("\n").length;

    if (currentChunkLength > MAX_CHUNK_LENGTH) {
      chunks.push(currentChunkLines.join("\n"));
      currentChunkLines = [];
    } else {
      currentChunkLines.push(lineText);
    }
  });
  if (currentChunkLines.length > 0) chunks.push(currentChunkLines.join("\n"));

  return chunks;
}

async function convertTextChunkToSpeech(text, options) {
  // Check cache for generated audio based on unique hash of text content
  const textHash = md5(text);

  let cachedAudio = new AssetCache(textHash);

  if (cachedAudio.isCacheValid("365d")) {
    console.log(
      `[astro-text-to-speech] Using cached MP3 data for hash ${textHash}`
    );

    return cachedAudio.getCachedValue();
  } else {
    console.log(
      `[astro-text-to-speech] Asking Microsoft API to generate MP3 for hash ${textHash}`
    );
  }

  // Setup Azure Text to Speech API

  if (!options.resourceKey)
    throw new Error(
      `[astro-text-to-speech] resourceKey is not set in the text to speech options.\n Either add the environment variable AZURE_SPEECH_RESOURCE_KEY or set 'resourceKey' in the 'textToSpeech' options when adding the plugin`
    );

  if (!options.region)
    throw new Error(
      `[astro-text-to-speech] region is not set in the text to speech options.\n Either add the environment variable AZURE_SPEECH_REGION or set 'region' in the 'textToSpeech' options when adding the plugin`
    );

  const speechConfig = SpeechConfig.fromSubscription(
    options.resourceKey,
    options.region
  );

  speechConfig.speechSynthesisLanguage = options.voiceName.slice(0, 5);
  speechConfig.speechSynthesisVoiceName = options.voiceName;
  speechConfig.speechSynthesisOutputFormat =
    SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

  const TMP_FOLDER_NAME = `.tmp-astro-text-to-speech`;

  //   TODO: write hook to delete the temp folder after build
  if (!fs.existsSync(TMP_FOLDER_NAME)) {
    fs.mkdirSync(TMP_FOLDER_NAME);
  }

  const tmpFilePath = join(TMP_FOLDER_NAME, `${textHash}.mp3`);

  const audioConfig = AudioConfig.fromAudioFileOutput(tmpFilePath);

  const synthesizer = new SpeechSynthesizer(speechConfig, audioConfig);

  // Generate MP3 with Azure API

  const audioArrayBuffer = await new Promise((resolve, reject) => {
    const encodedText = encode(text);

    const ssmlText = `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="${options.voiceName.slice(
      0,
      5
    )}">
      <voice name="${options.voiceName}">
      ${options.lexiconUrl ? `<lexicon uri="${options.lexiconUrl}" />` : ""}
      <prosody rate="${options.speed}" pitch="0%">
      ${encodedText}
      </prosody>
      </voice>
      </speak>`;

    synthesizer.speakSsmlAsync(
      ssmlText,
      async (result) => {
        synthesizer.close();
        if (result) {
          resolve(result.privAudioData);
        } else {
          reject(result);
        }
      },
      (error) => {
        console.log(`[astro-text-to-speech] Error while generating MP3`);
        synthesizer.close();
        throw new Error(error);
      }
    );
  });

  const audioBuffer = Buffer.from(audioArrayBuffer);
  await cachedAudio.save(audioBuffer, "buffer");

  return audioBuffer;
}

export async function convertMarkdownToSpeech(mdContent) {
  const options = {
    voiceName: "en-AU-WilliamNeural",
    resourceKey: import.meta.env.AZURE_SPEECH_RESOURCE_KEY,
    region: import.meta.env.AZURE_SPEECH_REGION,
    speed: "0%",
    lexiconUrl: null,
  };

  const text = markdownToTxt(mdContent);

  // chunk text
  const chunks = chunkText(text);

  // convert chunks to audio buffers
  const audioBuffers = await Promise.all(
    chunks.map((chunk) => convertTextChunkToSpeech(chunk, options))
  );

  // join the audio buffers
  return Buffer.concat(audioBuffers);
}
