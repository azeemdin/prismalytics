import { Datasource, DatasourceType } from '../../../database/entities';
import { DatabaseConnector } from './connector.interface';
import { PostgresConnector } from './postgres.connector';
import { MySQLConnector } from './mysql.connector';
import { MongoDBConnector } from './mongodb.connector';
import { MSSQLConnector } from './mssql.connector';
import { SQLiteConnector } from './sqlite.connector';
import { RestApiConnector } from './rest-api.connector';
import { ElasticsearchConnector } from './elasticsearch.connector';
import { CsvConnector } from './csv.connector';
import { OracleConnector } from './oracle.connector';
import { BadRequestException } from '@nestjs/common';

export function createConnector(datasource: Datasource, password: string): DatabaseConnector {
  const { config, type } = datasource;

  switch (type) {
    case DatasourceType.POSTGRESQL:
      return new PostgresConnector({
        host: config.host!,
        port: config.port ?? 5432,
        database: config.database!,
        username: config.username!,
        password,
        ssl: config.ssl,
      });

    case DatasourceType.MYSQL:
      return new MySQLConnector({
        host: config.host!,
        port: config.port ?? 3306,
        database: config.database!,
        username: config.username!,
        password,
        ssl: config.ssl,
      });

    case DatasourceType.MONGODB:
      return new MongoDBConnector({
        host: config.host,
        port: config.port ?? 27017,
        database: config.database,
        username: config.username,
        ssl: config.ssl,
        connectionStringMode: config.connectionStringMode,
      }, password);

    case DatasourceType.MSSQL:
      return new MSSQLConnector({
        host: config.host!,
        port: config.port ?? 1433,
        database: config.database!,
        username: config.username!,
        password,
        ssl: config.ssl,
      });

    case DatasourceType.SQLITE:
      return new SQLiteConnector({
        database: config.database!,
      });

    case DatasourceType.REST_API:
      return new RestApiConnector({
        baseUrl: config.baseUrl ?? config.host ?? '',
        headers: config.headers,
      }, password || undefined);

    case DatasourceType.ELASTICSEARCH:
      return new ElasticsearchConnector({
        host: config.host!,
        port: config.port ?? 9200,
        ssl: config.ssl,
        index: config.index,
      }, password || undefined);

    case DatasourceType.CSV:
      return new CsvConnector(config.csvRows ?? [], config.csvColumns ?? []);

    case DatasourceType.ORACLE:
      return new OracleConnector({
        host: config.host!,
        port: config.port ?? 1521,
        serviceName: config.serviceName ?? config.database!,
        username: config.username!,
        password,
        ssl: config.ssl,
      });

    default:
      throw new BadRequestException(`Connector not yet implemented for type: ${type}`);
  }
}
