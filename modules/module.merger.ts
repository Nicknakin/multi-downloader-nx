import * as iso639 from 'iso-639';
import { fonts, fontMime } from './module.fontsData';
import path from 'path';
import fs from 'fs';
import { LanguageItem } from './module.langsData';

export type MergerInput = {
  path: string,
  lang: string,
  lookup?: false,
}

export type SubtitleInput = {
  language: string,
  file: string,
  title?: string
  lookup?: false,
}

export type Font = keyof typeof fonts;

export type ParsedFont = {
  name: string,
  path: string,
  mime: string,
}

export type MergerOptions = {
  videoAndAudio: MergerInput[],
  onlyVid: MergerInput[],
  onlyAudio: MergerInput[],
  subtitels: SubtitleInput[],
  output: string,
  simul?: boolean,
  fonts?: ParsedFont[],
  skipSubMux?: boolean
}

class Merger {
  private subDict = {
    'en': 'English (United State)',
    'es': 'Español (Latinoamericano)',
    'pt': 'Português (Brasil)',
    'ja': '日本語',
    'cmn': '官話'
  } as {
    [key: string]: string;
  };
  
  constructor(private options: MergerOptions) {
    if (this.options.skipSubMux)
      this.options.subtitels = [];
  }

  public FFmpeg() : string {
    const args = [];
    const metaData = [];

    let index = 0;
    let audioIndex = 0;
    let hasVideo = false;

    for (const vid of this.options.videoAndAudio) {
      args.push(`-i "${vid.path}"`);
      if (!hasVideo) {
        metaData.push(`-map ${index}:a -map ${index}:v`);
        metaData.push(`-metadata:s:a:${audioIndex} language=${vid.lookup === false ? vid.lang : Merger.getLanguageCode(vid.lang, vid.lang)}`);
        metaData.push(`-metadata:s:v:${index} title="[Video Stream]"`);
        hasVideo = true;
      } else {
        metaData.push(`-map ${index}:a`);
        metaData.push(`-metadata:s:a:${audioIndex} language=${vid.lookup === false ? vid.lang : Merger.getLanguageCode(vid.lang, vid.lang)}`);
      }
      audioIndex++;
      index++;
    }

    for (const vid of this.options.onlyVid) {
      if (!hasVideo) {
        args.push(`-i "${vid.path}"`);
        metaData.push(`-map ${index} -map -${index}:a`);
        metaData.push(`-metadata:s:v:${index} title="[Video Stream]"`);
        hasVideo = true;
        index++;
      }
    }

    for (const aud of this.options.onlyAudio) {
      args.push(`-i "${aud.path}"`);
      metaData.push(`-map ${index}`);
      metaData.push(`-metadata:s:a:${audioIndex} language=${aud.lookup === false ? aud.lang : Merger.getLanguageCode(aud.lang, aud.lang)}`);
      index++;
      audioIndex++;
    }

    for (const index in this.options.subtitels) {
      const sub = this.options.subtitels[index];
      args.push(`-i "${sub.file}"`);
    }

    args.push(...metaData);
    args.push(...this.options.subtitels.map((_, subIndex) => `-map ${subIndex + index}`));
    args.push(
      '-c:v copy',
      '-c:a copy'
    );
    args.push(this.options.output.split('.').pop()?.toLowerCase() === 'mp4' ? '-c:s mov_text' : '-c:s ass');
    args.push(...this.options.subtitels.map((sub, subindex) => `-metadata:s:s:${subindex} title="${
      sub.title !== undefined ? sub.title : sub.lookup === false ? sub.language : Merger.getLanguageCode(sub.language)
    }" -metadata:s:s:${subindex} language=${sub.lookup === false ? sub.language : Merger.getLanguageCode(sub.language)}`));
    args.push(`"${this.options.output}"`);
    return args.join(' ');
  }

  public static getLanguageCode = (from: string, _default = 'eng'): string => {
    if (from === 'cmn') return 'chi';
    for (const lang in iso639.iso_639_2) {
      const langObj = iso639.iso_639_2[lang];
      if (Object.prototype.hasOwnProperty.call(langObj, '639-1') && langObj['639-1'] === from) {
        return langObj['639-2'] as string;
      }
    }
    return _default;
  };

  public MkvMerge = () => {
    const args = [];

    let hasVideo = false;

    args.push(`-o "${this.options.output}"`);
    args.push(
      '--no-date',
      '--disable-track-statistics-tags',
      '--engage no_variable_data',
    );

    for (const vid of this.options.onlyVid) {
      if (!hasVideo) {
        args.push(
          '--video-tracks 0',
          '--no-audio'
        );
        const trackName = (vid.lookup === false ? vid.lang : this.subDict[vid.lang]) + (this.options.simul ? ' [Simulcast]' : ' [Uncut]');
        args.push('--track-name', `0:"${trackName}"`);
        args.push(`--language 0:${Merger.getLanguageCode(vid.lang, vid.lang)}`);
        hasVideo = true;
        args.push(`"${vid.path}"`);
      }
    }

    for (const vid of this.options.videoAndAudio) {
      if (!hasVideo) {
        args.push(
          '--video-tracks 0',
          '--audio-tracks 1'
        );
        const trackName = (vid.lookup === false ? vid.lang : this.subDict[vid.lang]) + (this.options.simul ? ' [Simulcast]' : ' [Uncut]');
        args.push('--track-name', `0:"${trackName}"`);
        args.push('--track-name', `1:"${trackName}"`);
        args.push(`--language 1:${Merger.getLanguageCode(vid.lang, vid.lang)}`);
        hasVideo = true;
      } else {
        args.push(
          '--no-video',
          '--audio-tracks 1'
        );
        const trackName = (vid.lookup === false ? vid.lang : this.subDict[vid.lang]) + (this.options.simul ? ' [Simulcast]' : ' [Uncut]');
        args.push('--track-name', `1:"${trackName}"`);
        args.push(`--language 1:${Merger.getLanguageCode(vid.lang, vid.lang)}`);
      }
      args.push(`"${vid.path}"`);
    }

    for (const aud of this.options.onlyAudio) {
      const trackName = (aud.lookup === false ? aud.lang : this.subDict[aud.lang]) + (this.options.simul ? ' [Simulcast]' : ' [Uncut]');
      args.push('--track-name', `0:"${trackName}"`);
      args.push(`--language 0:${Merger.getLanguageCode(aud.lang, aud.lang)}`);
      args.push(
        '--no-video',
        '--audio-tracks 0'
      );
      args.push(`"${aud.path}"`);
    }

    if (this.options.subtitels.length > 0) {
      for (const subObj of this.options.subtitels) {
        args.push('--track-name', (subObj.title !== undefined ? `0:"${subObj.title}"` : `0:"${subObj.lookup === false ? subObj.language : Merger.getLanguageCode(subObj.language)}"`));
        args.push('--language', `0:"${subObj.lookup === false ? subObj.language : Merger.getLanguageCode(subObj.language)}"`);
        args.push(`"${subObj.file}"`);
      }
    } else {
      args.push(
        '--no-subtitles',
      );
    }
    if (this.options.fonts && this.options.fonts.length > 0) {
      for (const f of this.options.fonts) {
        console.log(f.path);
        args.push('--attachment-name', f.name);
        args.push('--attachment-mime-type', f.mime);
        args.push('--attach-file', f.path);
      }
    } else {
      args.push(
        '--no-attachments'
      );
    }

    return args.join(' ');
  };

  public static checkMerger(bin: {
    mkvmerge?: string,
    ffmpeg?: string
  }, useMP4format: boolean) : {
    MKVmerge?: string,
    FFmpeg?: string
  } {
    if (useMP4format && bin.ffmpeg) {
      return {
        FFmpeg: bin.ffmpeg
      };
    } else if (!useMP4format && (bin.mkvmerge || bin.ffmpeg)) {
      return {
        MKVmerge: bin.mkvmerge,
        FFmpeg: bin.ffmpeg
      };
    } else if (useMP4format) {
      console.log('[WARN] FFmpeg not found, skip muxing...');
    } else if (!bin.mkvmerge) {
      console.log('[WARN] MKVMerge not found, skip muxing...');
    }
    return {};
  }

  public static makeFontsList (fontsDir: string, subs: {
    language: LanguageItem,
    fonts: Font[]
  }[]) : ParsedFont[] {
    let fontsNameList: Font[] = []; const fontsList = [], subsList = []; let isNstr = true;
    for(const s of subs){
      fontsNameList.push(...s.fonts);
      subsList.push(s.language.locale);
    }
    fontsNameList = [...new Set(fontsNameList)];
    if(subsList.length > 0){
      console.log('\n[INFO] Subtitles: %s (Total: %s)', subsList.join(', '), subsList.length);
      isNstr = false;
    }
    if(fontsNameList.length > 0){
      console.log((isNstr ? '\n' : '') + '[INFO] Required fonts: %s (Total: %s)', fontsNameList.join(', '), fontsNameList.length);
    }
    for(const f of fontsNameList){
      const fontFile = fonts[f];
      if(fontFile){
        const fontPath = path.join(fontsDir, fontFile);
        const mime = fontMime(fontFile);
        if(fs.existsSync(fontPath) && fs.statSync(fontPath).size != 0){
          fontsList.push({
            name: fontFile,
            path: fontPath,
            mime: mime,
          });
        }
      }
    }
    return fontsList;
  }

  public cleanUp() {
    this.options.onlyAudio.concat(this.options.onlyVid).concat(this.options.videoAndAudio).forEach(a => fs.unlinkSync(a.path));
    this.options.subtitels.forEach(a => fs.unlinkSync(a.file));
  }

}

export default Merger;