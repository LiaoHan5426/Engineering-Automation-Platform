package com.lh.eap.web;

import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.select.*;
import net.sf.jsqlparser.expression.*;
import net.sf.jsqlparser.expression.operators.relational.EqualsTo;
import net.sf.jsqlparser.schema.*;
import java.util.*;

final class DeterministicSqlAnalyzer {
    private DeterministicSqlAnalyzer(){}
    static Map<String,Object> analyze(String sql){
        try{
            var statement=CCJSqlParserUtil.parse(sql);
            var findings=new ArrayList<String>();var suggestions=new ArrayList<String>();var keys=new ArrayList<String>();var tables=new ArrayList<String>();
            var aliases=new HashMap<String,String>();var columns=new ArrayList<Map<String,String>>();
            if(statement instanceof PlainSelect select){
                if(select.getFromItem() instanceof Table table){tables.add(table.getFullyQualifiedName());alias(table,aliases);}
                if(select.getJoins()!=null)for(var join:select.getJoins())if(join.getRightItem() instanceof Table table)alias(table,aliases);
                if(select.getSelectItems().stream().anyMatch(item->item.getExpression() instanceof AllColumns||item.getExpression() instanceof AllTableColumns)){
                    findings.add("projection.select_star");suggestions.add("当前投影包含通配符；请明确业务所需列，减少传输量并降低表结构变化风险。");
                }
                if(select.getJoins()!=null)for(var join:select.getJoins()){
                    if(join.getRightItem() instanceof Table table)tables.add(table.getFullyQualifiedName());
                    for(var on:join.getOnExpressions()) collectKeys(on,keys,columns,aliases);
                    if(join.isCross() || (join.getOnExpressions().isEmpty()&&!join.isNatural()&&(join.getUsingColumns()==null||join.getUsingColumns().isEmpty()))){
                        findings.add("join.cartesian");suggestions.add("检测到无显式关联条件的连接："+join.getRightItem()+"，请确认笛卡尔积是否符合业务语义。");
                    }
                }
                if(select.getWhere()==null){
                    findings.add("query.no_filter");suggestions.add("查询"+String.join("、",tables)+"没有 WHERE 条件。若需要返回全部关联结果，不能随意添加过滤或 LIMIT；应检查输出行数及连接行数放大。");
                }
                for(var key:keys){
                    findings.add("join.equality");suggestions.add("关联条件 "+key+"：请核对连接列类型、唯一性和索引前导列，并用执行计划比较扫描与连接方式。没有高选择性过滤时，顺序扫描和哈希连接可能优于逐行索引查找，不能仅凭 JOIN 就创建索引。");
                }
                if(select.getOffset()!=null){findings.add("pagination.offset");suggestions.add("查询含 OFFSET；深分页需先确认稳定唯一排序，再比较基于游标的分页方案，不能直接改写而改变返回语义。");}
            }
            if(suggestions.isEmpty())suggestions.add("已解析 "+statement.getClass().getSimpleName()+"。当前没有足够结构或执行计划证据支持确定性改写，请提供业务语义及元数据。");
            return Map.of("parseStatus","valid","statementType",statement.getClass().getSimpleName(),"normalizedSql",statement.toString(),"findings",findings,"suggestions",suggestions,"tables",tables,"joinKeys",keys,"joinColumns",columns);
        }catch(Exception error){return Map.of("parseStatus","invalid","error","SQL 无法解析，请检查语法及数据库方言","suggestions",List.of("请修正 SQL 语法后重新分析；本次没有执行 SQL。"),"findings",List.of("syntax.invalid"));}
    }
    private static void alias(Table table,Map<String,String> aliases){
        aliases.put(table.getName(),table.getFullyQualifiedName());
        if(table.getAlias()!=null)aliases.put(table.getAlias().getName(),table.getFullyQualifiedName());
    }
    private static void collectKeys(Expression expression,List<String> keys,List<Map<String,String>> columns,Map<String,String> aliases){
        if(expression instanceof EqualsTo equality && equality.getLeftExpression() instanceof Column left && equality.getRightExpression() instanceof Column right){
            keys.add(equality.toString());
            for(var column:List.of(left,right)){
                var owner=column.getTable()==null?"":column.getTable().getName();
                if(owner!=null&&aliases.containsKey(owner))columns.add(Map.of("table",aliases.get(owner),"column",column.getColumnName(),"condition",equality.toString()));
            }
        }
        if(expression instanceof BinaryExpression binary){collectKeys(binary.getLeftExpression(),keys,columns,aliases);collectKeys(binary.getRightExpression(),keys,columns,aliases);}
    }
}
