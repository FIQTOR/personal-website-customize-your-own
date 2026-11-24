export interface TikTokStats {
  followers: number;
  following: number;
  likes: number;
  videoCount?: number;
  avatar?: string;
  nickname?: string;
}

export interface InstagramStats {
  followers: number;
  following: number;
  avatar?: string;
  name?: string;
}

export interface SocialConfig {
  usernames: {
    tiktok: string;
    instagram: string;
  };
  tiktok: TikTokStats;
  instagram: InstagramStats;
}

export const socialConfig: SocialConfig = {
  usernames: {
    tiktok: 'fiqtor',
    instagram: 'fiqtorr',
  },
  tiktok: {
    followers: 1982,
    following: 29,
    likes: 136800,
    videoCount: 44,
    avatar: 'https://p16-common-sign.tiktokcdn-us.com/tos-alisg-avt-0068/4ea3bc439aaa344a04d181b0db357515~tplv-tiktokx-cropcenter:100:100.jpeg?dr=9640&refresh_token=a7e98a5a&x-expires=1795676400&x-signature=LpeYgQ4j8%2Boetp%2B6B1UPSb%2FHMik%3D&t=4d5b0474&ps=13740610&shp=a5d48078&shcp=81f88b70&idc=useast5',
    nickname: 'fiqtor dev',
  },
  instagram: {
    followers: 742,
    following: 579,
    avatar: 'https://6f2859a7-8667-4b05-9978-a8922e29bf1f.selstorage.ru/INST:17841407124984691?time=1795506766',
    name: 'fiqtor 胡伟明',
  },
};

export default socialConfig;


