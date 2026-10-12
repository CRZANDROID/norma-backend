import { Injectable } from '@nestjs/common';
import { searchPublicWeb } from './public-web-search';

@Injectable()
export class ProfileWebSearchService {
  search(companyName: string, description?: string) {
    return searchPublicWeb(companyName, description);
  }
}
