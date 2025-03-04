import { SixtySecondsScraper } from '../60s.scraper';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SixtySecondsScraper', () => {
  let scraper: SixtySecondsScraper;

  beforeEach(() => {
    scraper = new SixtySecondsScraper();
    // 清除所有模拟
    jest.clearAllMocks();
  });

  describe('validateConfig', () => {
    it('应该始终返回 true', async () => {
      const result = await scraper.validateConfig();
      expect(result).toBe(true);
    });
  });

  describe('scrape', () => {
    it('应该成功抓取并解析新闻数据', async () => {
      // 模拟 API 响应
      const mockResponse = {
        data: {
          code: 200,
          message: 'success',
          data: {
            date: '2024-03-20',
            news: ['新闻1', '新闻2'],
            audio: {
              music: 'music.mp3',
              news: 'news.mp3'
            },
            tip: '今日提示',
            cover: 'cover.jpg',
            link: 'https://example.com',
            created: '2024-03-20T00:00:00Z',
            created_at: 1710892800000,
            updated: '2024-03-20T00:00:00Z',
            updated_at: 1710892800000
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await scraper.scrape('test');

      // 验证 API 调用
      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.60s.viki.moe/60s');
      
      // 验证返回结果
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: '60s-2024-03-20-0',
        title: '新闻1',
        content: '新闻1',
        url: 'https://example.com',
        publishDate: '2024-03-20T00:00:00.000Z',
        metadata: {
          keywords: [],
          audio: {
            music: 'music.mp3',
            news: 'news.mp3'
          },
          tip: '今日提示',
          cover: 'cover.jpg',
          date: '2024-03-20'
        },
        score: 1
      });
    });

    it('当 API 返回错误时应该抛出异常', async () => {
      // 模拟 API 错误响应
      const mockErrorResponse = {
        data: {
          code: 500,
          message: '服务器错误'
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockErrorResponse);

      await expect(scraper.scrape('test')).rejects.toThrow('服务器错误');
    });

    it('当网络请求失败时应该抛出异常', async () => {
      // 模拟网络错误
      mockedAxios.get.mockRejectedValueOnce(new Error('网络错误'));

      await expect(scraper.scrape('test')).rejects.toThrow('网络错误');
    });
  });

  describe('refresh', () => {
    it('应该成功执行刷新操作', async () => {
      await expect(scraper.refresh()).resolves.not.toThrow();
    });
  });
}); 